fn main() {
  // macOS 的自定义通知通道（见 src/mac_notify.m）。
  if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
    cc::Build::new()
      .file("src/mac_notify.m")
      .flag("-fobjc-arc")
      .flag("-Wno-deprecated-declarations")
      .flag("-mmacosx-version-min=11.0")
      .compile("mac_notify");
    println!("cargo:rustc-link-lib=framework=UserNotifications");
    println!("cargo:rustc-link-lib=framework=Foundation");
    println!("cargo:rerun-if-changed=src/mac_notify.m");
  }

  tauri_build::build()
}
