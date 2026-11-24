package app.parho.reader

import android.app.Application
import com.google.firebase.Firebase
import com.google.firebase.appcheck.appCheck
import com.google.firebase.appcheck.debug.DebugAppCheckProviderFactory
import com.google.firebase.initialize

class ParhoApp : Application() {
    override fun onCreate() {
        super.onCreate()
        Firebase.initialize(this)
        // Debug provider for the hackathon build: logs a debug token (logcat tag "com.google.firebase.appcheck")
        // that must be registered in Firebase console → App Check → Parho Android → Manage debug tokens.
        Firebase.appCheck.installAppCheckProviderFactory(DebugAppCheckProviderFactory.getInstance())
    }
}
