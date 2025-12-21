import type {AppInitConfig} from './AppInitConfig.js';
import {createModuleRunner} from './ModuleRunner.js';
import {disallowMultipleAppInstance} from './modules/SingleInstanceApp.js';
import {createWindowManagerModule} from './modules/WindowManager.js';
import {terminateAppOnLastWindowClose} from './modules/ApplicationTerminatorOnLastWindowClose.js';
import {hardwareAccelerationMode} from './modules/HardwareAccelerationModule.js';
import {autoUpdater} from './modules/AutoUpdater.js';
import {allowInternalOrigins} from './modules/BlockNotAllowdOrigins.js';
import {allowExternalUrls} from './modules/ExternalUrls.js';
import {createSystemTrayModule} from './modules/SystemTrayModule.js';
import {createPickerWindowModule} from './modules/PickerWindowModule.js';
import {createIPCHandlersModule} from './modules/IPCHandlersModule.js';
import {createStickerManagerModule} from './modules/StickerManagerModule.js';
import {createRecentStickersModule} from './modules/RecentStickersModule.js';
import {createConfigManagerModule} from './modules/ConfigManagerModule.js';


export async function initApp(initConfig: AppInitConfig) {
  const moduleRunner = createModuleRunner()
    // Disable WindowManager mặc định vì chúng ta dùng SystemTray và PickerWindow riêng
    // .init(createWindowManagerModule({initConfig, openDevTools: import.meta.env.DEV}))
    .init(disallowMultipleAppInstance())
    .init(terminateAppOnLastWindowClose())
    .init(hardwareAccelerationMode({enable: false}))
    .init(autoUpdater())
    // Sticker Manager (phải đăng ký trước IPC Handlers để protocol được setup)
    .init(createStickerManagerModule())
    // Config Manager (phải đăng ký trước IPC Handlers)
    .init(createConfigManagerModule())
    // Recent Stickers
    .init(createRecentStickersModule())
    // IPC Handlers
    .init(createIPCHandlersModule())
    // Sticker Picker modules
    .init(createSystemTrayModule({initConfig}))
    .init(createPickerWindowModule({initConfig}))

    // Install DevTools extension if needed
    // .init(chromeDevToolsExtension({extension: 'VUEJS3_DEVTOOLS'}))

    // Security
    .init(allowInternalOrigins(
      new Set(initConfig.renderer instanceof URL ? [initConfig.renderer.origin] : []),
    ))
    .init(allowExternalUrls(
      new Set([
        'https://vite.dev',
        'https://developer.mozilla.org',
        'https://solidjs.com',
        'https://qwik.dev',
        'https://lit.dev',
        'https://react.dev',
        'https://preactjs.com',
        'https://www.typescriptlang.org',
        'https://vuejs.org',
        'https://github.com', // Cho phép mở GitHub links
      ]),
    ));

  await moduleRunner;
}
