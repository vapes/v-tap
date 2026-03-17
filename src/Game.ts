import { Application } from 'pixi.js';
import { LobbyScene } from './scenes/LobbyScene';
import { GameModeSelectScene } from './scenes/GameModeSelectScene';
import { GameScene } from './scenes/GameScene';
import { TapGameScene } from './scenes/TapGameScene';
import mathConfig from './math-config.json';

export class Game {
  private app: Application;
  private lobbyScene: LobbyScene;
  private modeSelectScene: GameModeSelectScene;
  private gameScene: GameScene;
  private tapGameScene: TapGameScene;

  constructor(app: Application) {
    this.app = app;
    this.lobbyScene      = new LobbyScene(app);
    this.gameScene       = new GameScene(app);
    this.tapGameScene    = new TapGameScene(app);
    this.modeSelectScene = new GameModeSelectScene(app);

    this.modeSelectScene.onModeSelected = (mode) => {
      this.modeSelectScene.hide();
      if (mode === 'crash') {
        this.gameScene.show(mathConfig.crash.fixedBet);
      } else {
        this.tapGameScene.show(mathConfig.tap.fixedBet);
      }
    };

    this.gameScene.onLeaveTable = () => {
      this.gameScene.hide();
      this.modeSelectScene.show();
    };

    this.tapGameScene.onLeaveTable = () => {
      this.tapGameScene.hide();
      this.modeSelectScene.show();
    };
  }

  start() {
    this.lobbyScene.show(() => {
      this.lobbyScene.hide();
      this.modeSelectScene.show();
    });
  }

  onResize(width: number, height: number) {
    this.gameScene.onResize(width, height);
    this.tapGameScene.onResize(width, height);
    this.lobbyScene.onResize(width, height);
    this.modeSelectScene.onResize(width, height);
  }
}
