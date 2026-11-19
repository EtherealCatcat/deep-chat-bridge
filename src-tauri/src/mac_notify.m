// DeepHome 的 macOS 通知通道。
//
// 为什么不用 tauri-plugin-notification 的发送路径：它底层是 notify-rust →
// mac-notification-sys → 已废弃的 NSUserNotificationCenter。那套 API 在 App 处于
// 前台（active）时会把展示决定权交给 delegate 的
// `userNotificationCenter:shouldPresentNotification:`，
// 而 mac-notification-sys 没有实现它，于是系统一律判为“不展示”，
// 通知只会静默落进通知中心。日志里的 `askBeforePresenting: true` 就是这个询问。
//
// 这里改走现代的 UNUserNotificationCenter，并在 willPresent 里显式返回
// banner/list/sound，这样 App 在前台也能从右上角弹出横幅。

#import <Foundation/Foundation.h>
#import <UserNotifications/UserNotifications.h>

typedef void (*dh_notify_click_callback)(void);

static dh_notify_click_callback g_click_callback = NULL;
static id g_delegate = nil;
static BOOL g_initialized = NO;

static BOOL dh_is_bundled(void) {
  NSString *identifier = [[NSBundle mainBundle] bundleIdentifier];
  return identifier.length > 0;
}

@interface DHNotificationDelegate : NSObject <UNUserNotificationCenterDelegate>
@end

@implementation DHNotificationDelegate

- (void)userNotificationCenter:(UNUserNotificationCenter *)center
       willPresentNotification:(UNNotification *)notification
         withCompletionHandler:(void (^)(UNNotificationPresentationOptions))completionHandler {
  // App 在前台时也要求横幅 + 声音；这是整个文件存在的理由。
  UNNotificationPresentationOptions options = UNNotificationPresentationOptionBanner |
                                              UNNotificationPresentationOptionList |
                                              UNNotificationPresentationOptionSound;
  NSLog(@"[DeepHome] willPresent -> banner");
  completionHandler(options);
}

- (void)userNotificationCenter:(UNUserNotificationCenter *)center
    didReceiveNotificationResponse:(UNNotificationResponse *)response
             withCompletionHandler:(void (^)(void))completionHandler {
  NSLog(@"[DeepHome] notification clicked");
  if (g_click_callback != NULL) {
    g_click_callback();
  }
  completionHandler();
}

@end

int dh_notify_supported(void) {
  return dh_is_bundled() ? 1 : 0;
}

void dh_notify_init(dh_notify_click_callback callback) {
  g_click_callback = callback;
  if (!dh_is_bundled() || g_initialized) {
    return;
  }
  g_initialized = YES;

  g_delegate = [[DHNotificationDelegate alloc] init];
  UNUserNotificationCenter *center = [UNUserNotificationCenter currentNotificationCenter];
  // delegate 属性是 weak，所以 g_delegate 必须由本文件强持有。
  center.delegate = (id<UNUserNotificationCenterDelegate>)g_delegate;

  [center requestAuthorizationWithOptions:(UNAuthorizationOptionAlert | UNAuthorizationOptionSound)
                        completionHandler:^(BOOL granted, NSError *error) {
    if (error != nil) {
      NSLog(@"[DeepHome] requestAuthorization error: %@", error.localizedDescription);
    }
    [center getNotificationSettingsWithCompletionHandler:^(UNNotificationSettings *settings) {
      NSLog(@"[DeepHome] notification authorization granted=%d status=%ld",
            (int)granted, (long)settings.authorizationStatus);
    }];
  }];
}

void dh_notify(const char *title, const char *body, int with_sound) {
  if (!dh_is_bundled()) {
    return;
  }

  NSString *title_string = title != NULL ? [NSString stringWithUTF8String:title] : @"DeepHome";
  NSString *body_string = body != NULL ? [NSString stringWithUTF8String:body] : @"";

  UNMutableNotificationContent *content = [[UNMutableNotificationContent alloc] init];
  content.title = title_string != nil ? title_string : @"DeepHome";
  content.body = body_string != nil ? body_string : @"";
  if (with_sound != 0) {
    content.sound = [UNNotificationSound defaultSound];
  }

  NSString *identifier = [[NSUUID UUID] UUIDString];
  UNNotificationRequest *request = [UNNotificationRequest requestWithIdentifier:identifier
                                                                       content:content
                                                                       trigger:nil];
  [[UNUserNotificationCenter currentNotificationCenter] addNotificationRequest:request
                                                         withCompletionHandler:^(NSError *error) {
    if (error != nil) {
      NSLog(@"[DeepHome] addNotificationRequest failed: %@", error.localizedDescription);
    } else {
      NSLog(@"[DeepHome] notification queued: %@", identifier);
    }
  }];
}
