package com.vozsynth.android

import android.os.Bundle
import android.view.WindowManager
import android.webkit.WebSettings
import androidx.core.view.WindowCompat
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Evita sobreposição da WebView com o relógio e ícones da barra de status do Android
        WindowCompat.setDecorFitsSystemWindows(window, true)
        window.addFlags(WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED)

        val webView = bridge?.webView ?: return
        val settings: WebSettings = webView.settings
        settings.mediaPlaybackRequiresUserGesture = false
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.javaScriptEnabled = true
    }
}
