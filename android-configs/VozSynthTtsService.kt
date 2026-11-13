package com.vozsynth.android

import android.media.AudioFormat
import android.os.Bundle
import android.speech.tts.SynthesisCallback
import android.speech.tts.SynthesisRequest
import android.speech.tts.TextToSpeech
import android.speech.tts.TextToSpeechService
import android.speech.tts.UtteranceProgressListener
import java.io.File
import java.io.FileInputStream
import java.util.Locale
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Serviço nativo opcional caso queira registrar o VozSynth Android como
 * Mecanismo Preferencial do sistema (TalkBack / Selecionar para falar).
 * Requer compilação nativa via Capacitor + Android Studio.
 */
class VozSynthTtsService : TextToSpeechService() {
    @Volatile
    private var delegateTts: TextToSpeech? = null
    @Volatile
    private var delegateReady = false
    @Volatile
    private var stopped = false

    override fun onCreate() {
        super.onCreate()
        // Delega síntese nativa para o motor Google TTS instalado no aparelho (sem loop circular)
        delegateTts = TextToSpeech(applicationContext, { status ->
            delegateReady = (status == TextToSpeech.SUCCESS)
            if (delegateReady) {
                delegateTts?.language = Locale("pt", "BR")
            }
        }, "com.google.android.tts")
    }

    override fun onDestroy() {
        delegateTts?.stop()
        delegateTts?.shutdown()
        delegateTts = null
        super.onDestroy()
    }

    override fun onIsLanguageAvailable(lang: String?, country: String?, variant: String?): Int {
        return when {
            lang.equals("por", true) || lang.equals("pt", true) -> {
                if (country.equals("BRA", true) || country.equals("BR", true)) {
                    TextToSpeech.LANG_COUNTRY_AVAILABLE
                } else {
                    TextToSpeech.LANG_AVAILABLE
                }
            }
            lang.equals("eng", true) || lang.equals("en", true) -> TextToSpeech.LANG_AVAILABLE
            lang.equals("spa", true) || lang.equals("es", true) -> TextToSpeech.LANG_AVAILABLE
            else -> TextToSpeech.LANG_NOT_SUPPORTED
        }
    }

    override fun onGetLanguage(): Array<String> = arrayOf("por", "BRA", "")

    override fun onLoadLanguage(lang: String?, country: String?, variant: String?): Int {
        return onIsLanguageAvailable(lang, country, variant)
    }

    override fun onStop() {
        stopped = true
        delegateTts?.stop()
    }

    override fun onSynthesizeText(request: SynthesisRequest?, callback: SynthesisCallback?) {
        if (request == null || callback == null) return
        val text = request.charSequenceText?.toString()?.trim().orEmpty()
        if (text.isEmpty()) {
            callback.start(22050, AudioFormat.ENCODING_PCM_16BIT, 1)
            callback.done()
            return
        }

        stopped = false
        val tts = delegateTts
        if (tts == null || !delegateReady) {
            callback.error()
            return
        }

        val tempWav = File(cacheDir, "tts_${System.currentTimeMillis()}.wav")
        val latch = CountDownLatch(1)
        var ok = false

        tts.setSpeechRate((request.speechRate / 100f).coerceIn(0.4f, 2.5f))
        tts.setPitch((request.pitch / 100f).coerceIn(0.5f, 2.0f))

        val uttId = "vozsynth_${System.nanoTime()}"
        tts.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) {}
            override fun onDone(utteranceId: String?) {
                if (utteranceId == uttId) {
                    ok = true
                    latch.countDown()
                }
            }
            override fun onError(utteranceId: String?) {
                if (utteranceId == uttId) {
                    ok = false
                    latch.countDown()
                }
            }
        })

        val params = Bundle()
        val enqueue = tts.synthesizeToFile(text, params, tempWav, uttId)
        if (enqueue != TextToSpeech.SUCCESS) {
            tempWav.delete()
            callback.error()
            return
        }

        latch.await(12, TimeUnit.SECONDS)
        if (!ok || stopped || !tempWav.exists() || tempWav.length() <= 44L) {
            tempWav.delete()
            callback.error()
            return
        }

        try {
            FileInputStream(tempWav).use { fis ->
                val header = ByteArray(44)
                if (fis.read(header) < 44) {
                    callback.error()
                    return
                }
                val sampleRate = (header[24].toInt() and 0xff) or
                    ((header[25].toInt() and 0xff) shl 8) or
                    ((header[26].toInt() and 0xff) shl 16) or
                    ((header[27].toInt() and 0xff) shl 24)
                val channels = (header[22].toInt() and 0xff) or ((header[23].toInt() and 0xff) shl 8)

                callback.start(
                    if (sampleRate in 8000..48000) sampleRate else 22050,
                    AudioFormat.ENCODING_PCM_16BIT,
                    if (channels in 1..2) channels else 1
                )

                val chunk = ByteArray(4096)
                while (!stopped) {
                    val read = fis.read(chunk)
                    if (read <= 0) break
                    callback.audioAvailable(chunk, 0, read)
                }
            }
            callback.done()
        } catch (_: Exception) {
            callback.error()
        } finally {
            tempWav.delete()
        }
    }
}
