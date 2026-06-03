(function () {
  "use strict";

  window.addEventListener("DOMContentLoaded", () => {
    const SG = window.SummonGame;
    const ui = new SG.UIManager();
    const input = new SG.InputManager();
    const game = new SG.GameEngine(ui, input);

    window.SummonGame.app = { ui, input, game };
  });
})();
