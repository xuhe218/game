(function () {
  "use strict";

  const SG = (window.SummonGame = window.SummonGame || {});

  class InputManager {
    constructor() {
      this.down = new Set();
      this.pressListeners = new Set();
      this.systemListeners = new Set();
      this.blockedCodes = new Set([
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "Space",
        "Tab",
        "Digit1",
        "Digit2",
        "Numpad1",
        "Numpad2"
      ]);

      window.addEventListener("keydown", (event) => this.handleKeyDown(event), { passive: false });
      window.addEventListener("keyup", (event) => this.handleKeyUp(event), { passive: false });
      window.addEventListener("blur", () => this.clear());
    }

    handleKeyDown(event) {
      if (this.shouldBlock(event.code)) {
        event.preventDefault();
      }

      if (event.code === "Escape" || event.code === "Tab") {
        if (!event.repeat) {
          this.emitSystem("pause-toggle", event.code);
        }
        return;
      }

      this.down.add(event.code);
      if (!event.repeat) {
        this.emitPress(event.code);
      }
    }

    handleKeyUp(event) {
      if (this.shouldBlock(event.code)) {
        event.preventDefault();
      }
      this.down.delete(event.code);
    }

    shouldBlock(code) {
      return this.blockedCodes.has(code);
    }

    isDown(code) {
      return this.down.has(code);
    }

    isAnyDown(codes) {
      return codes.some((code) => this.down.has(code));
    }

    onPress(callback) {
      this.pressListeners.add(callback);
      return () => this.pressListeners.delete(callback);
    }

    onSystem(callback) {
      this.systemListeners.add(callback);
      return () => this.systemListeners.delete(callback);
    }

    emitPress(code) {
      this.pressListeners.forEach((callback) => callback(code));
    }

    emitSystem(action, code) {
      this.systemListeners.forEach((callback) => callback(action, code));
    }

    clear() {
      this.down.clear();
    }
  }

  SG.InputManager = InputManager;
})();
