//
//  AppexSaverMinimalView.swift
//  AppexSaverMinimalExtension
//
//  Copyright © 2026 Guillaume Louel. Licensed under the MIT License.
//  Agent Office changes: the rainbow animation is replaced by a full-bleed
//  WKWebView showing the Agent Office scene served by the local server.
//
//  The page draws itself (requestAnimationFrame, 30 fps cap), so
//  SSENeedsAnimationTimer stays false in Info.plist. The web view is created
//  when the view joins a window and torn down when it leaves it: the host
//  releases views without calling stopAnimation(), and a web view left loaded
//  would keep rendering in the background.
//
//  URL: `http://localhost:4317/` by default; override with
//  `defaults write dev.agent-office.saver.Extension url http://host:port/`
//  (from the extension's sandbox container domain, see README).
//

import ScreenSaver
import WebKit

private let logger = AppexLog.logger("View")

final class AppexSaverMinimalView: ScreenSaverView, WKNavigationDelegate {

    static let defaultURL = "http://localhost:4317/"
    /// Night background of the scene, shown until the page paints (no white flash).
    private static let night = NSColor(srgbRed: 0x11 / 255, green: 0x0d / 255, blue: 0x1a / 255, alpha: 1)

    private var webView: WKWebView?
    private var retry: DispatchWorkItem?

    override init?(frame: NSRect, isPreview: Bool) {
        logger.info("init(frame: \(NSStringFromRect(frame), privacy: .public), isPreview: \(isPreview))")
        super.init(frame: frame, isPreview: isPreview)
        wantsLayer = true
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        wantsLayer = true
    }

    deinit {
        logger.info("deinit")
    }

    override func makeBackingLayer() -> CALayer {
        let layer = CALayer()
        layer.backgroundColor = Self.night.cgColor
        layer.isOpaque = true
        return layer
    }

    // MARK: - URL

    private var url: URL {
        let module = Bundle(for: AppexSaverMinimalView.self).bundleIdentifier ?? "dev.agent-office.saver.Extension"
        let stored = ScreenSaverDefaults(forModuleWithName: module)?.string(forKey: "url")
        return URL(string: stored ?? Self.defaultURL) ?? URL(string: Self.defaultURL)!
    }

    // MARK: - Web view life cycle

    private func startWebView() {
        guard webView == nil else { return }
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        config.mediaTypesRequiringUserActionForPlayback = []
        let web = WKWebView(frame: bounds, configuration: config)
        web.autoresizingMask = [.width, .height]
        web.setValue(false, forKey: "drawsBackground")
        web.navigationDelegate = self
        addSubview(web)
        webView = web
        load()
    }

    private func stopWebView() {
        retry?.cancel()
        retry = nil
        guard let web = webView else { return }
        web.stopLoading()
        web.navigationDelegate = nil
        web.loadHTMLString("", baseURL: nil)
        web.removeFromSuperview()
        webView = nil
        logger.info("web view released")
    }

    private func load() {
        let target = url
        logger.info("loading \(target.absoluteString, privacy: .public)")
        webView?.load(URLRequest(url: target, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 5))
    }

    /// The server may not be up yet (login, restart): retry quietly every 5 s.
    private func scheduleRetry() {
        retry?.cancel()
        let item = DispatchWorkItem { [weak self] in self?.load() }
        retry = item
        DispatchQueue.main.asyncAfter(deadline: .now() + 5, execute: item)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        logger.info("page loaded")
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        logger.error("navigation failed: \(error.localizedDescription, privacy: .public)")
        scheduleRetry()
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        logger.error("provisional navigation failed: \(error.localizedDescription, privacy: .public)")
        scheduleRetry()
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        logger.error("web content process terminated, reloading")
        scheduleRetry()
    }

    // MARK: - ScreenSaverView

    override func startAnimation() {
        logger.info("startAnimation()")
        super.startAnimation()
        if window != nil { startWebView() }
    }

    override func stopAnimation() {
        logger.info("stopAnimation()")
        stopWebView()
        super.stopAnimation()
    }

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        logger.info("viewDidMoveToWindow() hasWindow=\(self.window != nil)")
        if window != nil { startWebView() } else { stopWebView() }
    }
}
