import type { ElectronApplication, JSHandle } from "playwright";
import { _electron as electron } from "playwright";
import { expect, test as base } from "@playwright/test";
import type { BrowserWindow } from "electron";
import { globSync } from "glob";
import { platform } from "node:process";
import { createHash } from "node:crypto";

process.env.PLAYWRIGHT_TEST = "true";

// Declare the types of your fixtures.
type TestFixtures = {
  electronApp: ElectronApplication;
  electronVersions: NodeJS.ProcessVersions;
};

const test = base.extend<TestFixtures>({
  electronApp: [
    async ({}, use) => {
      /**
       * Executable path depends on productName from electron-builder config
       * ProductName: "Matitmui Sticker Picker"
       */
      let executablePattern: string;
      if (platform === "win32") {
        executablePattern = "dist/win-unpacked/*Sticker*.exe";
      } else if (platform === "darwin") {
        executablePattern =
          "dist/mac-*/Matitmui Sticker Picker.app/Contents/MacOS/Matitmui Sticker Picker";
      } else {
        // Linux
        executablePattern = "dist/linux-unpacked/*sticker*";
      }

      let executablePath = globSync(executablePattern)[0];
      if (!executablePath) {
        // Fallback: try to find any executable in dist
        const fallbackPattern =
          platform === "win32"
            ? "dist/**/*.exe"
            : platform === "darwin"
            ? "dist/**/Matitmui Sticker Picker"
            : "dist/**/*";
        const fallback = globSync(fallbackPattern);
        if (fallback.length > 0) {
          // Use first found executable
          executablePath = fallback[0];
        } else {
          throw new Error(
            `App Executable path not found. Tried: ${executablePattern}`
          );
        }
      }

      const electronApp = await electron.launch({
        executablePath: executablePath,
        args: ["--no-sandbox"],
      });

      electronApp.on("console", (msg) => {
        if (msg.type() === "error") {
          console.error(`[electron][${msg.type()}] ${msg.text()}`);
        }
      });

      await use(electronApp);

      // This code runs after all the tests in the worker process.
      await electronApp.close();
    },
    { scope: "worker", auto: true } as any,
  ],

  page: async ({ electronApp }, use) => {
    const page = await electronApp.firstWindow();
    // capture errors
    page.on("pageerror", (error) => {
      console.error(error);
    });
    // capture console messages
    page.on("console", (msg) => {
      console.log(msg.text());
    });

    await page.waitForLoadState("load");
    await use(page as any);
  },

  electronVersions: async ({ electronApp }, use) => {
    await use(await electronApp.evaluate(() => process.versions));
  },
});

test("Main window state", async ({ electronApp, page }) => {
  const window = await electronApp.browserWindow(page as any);
  const windowState = await window.evaluate(
    (
      mainWindow
    ): Promise<{
      isVisible: boolean;
      isDevToolsOpened: boolean;
      isCrashed: boolean;
    }> => {
      const getState = () => ({
        isVisible: mainWindow.isVisible(),
        isDevToolsOpened: mainWindow.webContents.isDevToolsOpened(),
        isCrashed: mainWindow.webContents.isCrashed(),
      });

      return new Promise((resolve) => {
        /**
         * The main window is created hidden, and is shown only when it is ready.
         * See {@link ../packages/main/src/mainWindow.ts} function
         */
        if (mainWindow.isVisible()) {
          resolve(getState());
        } else {
          mainWindow.once("ready-to-show", () => resolve(getState()));
        }
      });
    }
  );

  expect(windowState.isCrashed, "The app has crashed").toEqual(false);
  expect(windowState.isVisible, "The main window was not visible").toEqual(
    true
  );
  expect(windowState.isDevToolsOpened, "The DevTools panel was open").toEqual(
    false
  );
});

test.describe("Main window web content", async () => {
  test("The main window has an interactive button", async ({ page }) => {
    const element = page.getByRole("button");
    await expect(element).toBeVisible();
    await expect(element).toHaveText("count is 0");
    await element.click();
    await expect(element).toHaveText("count is 1");
  });

  test("The main window has a vite logo", async ({ page }) => {
    const element = page.getByAltText("Vite logo");
    await expect(element).toBeVisible();
    await expect(element).toHaveRole("img");
    const imgState = await element.evaluate(
      (img: HTMLImageElement) => img.complete
    );
    const imgNaturalWidth = await element.evaluate(
      (img: HTMLImageElement) => img.naturalWidth
    );

    expect(imgState).toEqual(true);
    expect(imgNaturalWidth).toBeGreaterThan(0);
  });
});

test.describe("Preload context should be exposed", async () => {
  test.describe(`versions should be exposed`, async () => {
    test("with same type`", async ({ page }) => {
      const type = await page.evaluate(
        () => typeof globalThis[btoa("versions")]
      );
      expect(type).toEqual("object");
    });

    test("with same value", async ({ page, electronVersions }) => {
      const value = await page.evaluate(() => globalThis[btoa("versions")]);
      expect(value).toEqual(electronVersions);
    });
  });

  test.describe(`sha256sum should be exposed`, async () => {
    test("with same type`", async ({ page }) => {
      const type = await page.evaluate(
        () => typeof globalThis[btoa("sha256sum")]
      );
      expect(type).toEqual("function");
    });

    test("with same behavior", async ({ page }) => {
      const testString = btoa(`${Date.now() * Math.random()}`);
      const expectedValue = createHash("sha256")
        .update(testString)
        .digest("hex");
      const value = await page.evaluate(
        (str) => globalThis[btoa("sha256sum")](str),
        testString
      );
      expect(value).toEqual(expectedValue);
    });
  });

  test.describe(`send should be exposed`, async () => {
    test("with same type`", async ({ page }) => {
      const type = await page.evaluate(() => typeof globalThis[btoa("send")]);
      expect(type).toEqual("function");
    });

    test("with same behavior", async ({ page, electronApp }) => {
      await electronApp.evaluate(async ({ ipcMain }) => {
        ipcMain.handle("test", (event, message) => btoa(message));
      });

      const testString = btoa(`${Date.now() * Math.random()}`);
      const expectedValue = btoa(testString);
      const value = await page.evaluate(
        async (str) => await globalThis[btoa("send")]("test", str),
        testString
      );
      expect(value).toEqual(expectedValue);
    });
  });
});
