package com.vozsynth.android

import android.os.Bundle
import android.speech.tts.TextToSpeech
import android.view.View
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebSettings
import androidx.core.view.WindowCompat
import com.getcapacitor.BridgeActivity
import java.util.Locale

class MainActivity : BridgeActivity(), TextToSpeech.OnInitListener {
    private var nativeTts: TextToSpeech? = null
    @Volatile
    private var ttsReady = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Evita sobreposição da WebView com o relógio e ícones da barra de status do Android
        WindowCompat.setDecorFitsSystemWindows(window, true)
        window.addFlags(WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED)

        nativeTts = TextToSpeech(this, this)

        val webView = bridge?.webView ?: return
        webView.overScrollMode = View.OVER_SCROLL_NEVER
        webView.isVerticalScrollBarEnabled = false
        val settings: WebSettings = webView.settings
        settings.mediaPlaybackRequiresUserGesture = false
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.javaScriptEnabled = true
        webView.addJavascriptInterface(AndroidTtsBridge(), "AndroidTTS")
    }

    override fun onInit(status: Int) {
        if (status == TextToSpeech.SUCCESS) {
            nativeTts?.language = Locale("pt", "BR")
            ttsReady = true
        }
    }

    override fun onDestroy() {
        nativeTts?.stop()
        nativeTts?.shutdown()
        super.onDestroy()
    }

    inner class AndroidTtsBridge {
        @JavascriptInterface
        fun isReady(): Boolean = ttsReady

        @JavascriptInterface
        fun speak(text: String, rate: Float, pitch: Float): Boolean {
            val tts = nativeTts ?: return false
            if (!ttsReady) return false
            tts.setSpeechRate(rate.coerceIn(0.4f, 2.4f))
            tts.setPitch(pitch.coerceIn(0.5f, 2.0f))
            tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "vozsynth_${System.currentTimeMillis()}")
            return true
        }

        @JavascriptInterface
        fun stop() {
            nativeTts?.stop()
        }
    }
}
