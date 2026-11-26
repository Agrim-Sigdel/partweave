import { TargetName, AppName, WiringForTarget } from "./types.js";
import { execSync } from "node:child_process";

/**
 * BaseModule enforces the shared rules for both Apps and Features.
 * TypeScript guarantees that any subclass implements these exact properties.
 */
export abstract class BaseModule {
  abstract readonly id: string;
  abstract readonly title: string;
  abstract readonly description?: string;
  abstract readonly targets: TargetName[];
  
  // Environment variables required by this module
  abstract getEnv(): Record<string, string>;

  // Optional lifecycle hook that runs after generation
  public onPostInstall?(): void {}
}

/**
 * AppModule enforces the rules for creating a core application (e.g. server, web).
 * Instead of statically copying files, it requires you to define how to natively initialize it.
 */
export abstract class AppModule extends BaseModule {
  readonly kind = "app";
  
  // What app does this represent?
  abstract readonly appName: AppName;

  /**
   * The exact native shell command to run to generate the pristine project.
   * e.g., "django-admin startproject server" or "npx create-next-app@latest web"
   */
  abstract getInitCommand(outDir: string): string;

  /**
   * Execute the native initialization.
   */
  public async initialize(outDir: string): Promise<void> {
    const cmd = this.getInitCommand(outDir);
    console.log(`Initializing ${this.appName} natively: ${cmd}`);
    execSync(cmd, { stdio: "inherit", cwd: outDir });
  }
}

/**
 * FeatureModule enforces the rules for creating a pluggable component (e.g. auth, db).
 */
export abstract class FeatureModule extends BaseModule {
  readonly kind = "feature";
  
  // Enforce dependency declarations
  abstract getRequiresApps(): AppName[];
  abstract getRequiresModules(): string[];
  
  // Enforce wiring injections (how this feature modifies the native files)
  abstract getWiring(): Record<TargetName, Partial<WiringForTarget>>;
}
