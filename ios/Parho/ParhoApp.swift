import SwiftUI
import FirebaseCore
import FirebaseAppCheck

@main
struct ParhoApp: App {
    init() {
        #if DEBUG
        // Simulator/dev builds: App Check debug provider. The token is printed in the Xcode/simctl log
        // ("Firebase App Check Debug Token: ..."); register it in Firebase console → App Check → Parho iOS.
        AppCheck.setAppCheckProviderFactory(AppCheckDebugProviderFactory())
        #else
        // Release builds on a real iPhone: App Attest, so only the genuine app can call Firebase AI Logic.
        AppCheck.setAppCheckProviderFactory(ParhoAppCheckFactory())
        #endif
        FirebaseApp.configure()
    }
    var body: some Scene { WindowGroup { RootView() } }
}

final class ParhoAppCheckFactory: NSObject, AppCheckProviderFactory {
    func createProvider(with app: FirebaseApp) -> AppCheckProvider? { AppAttestProvider(app: app) }
}
