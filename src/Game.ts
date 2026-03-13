import { Application } from 'pixi.js';
import { LobbyScene } from './scenes/LobbyScene';
import { RulesScene } from './scenes/RulesScene';
import { TableSelectScene } from './scenes/TableSelectScene';
import { GameScene } from './scenes/GameScene';

export class Game {
  private app: Application;
  private lobbyScene: LobbyScene;
  private rulesScene: RulesScene;
  private tableSelectScene: TableSelectScene;
  private gameScene: GameScene;

  constructor(app: Application) {
    this.app = app;
    this.lobbyScene = new LobbyScene(app);
    this.rulesScene = new RulesScene(app);
    this.gameScene = new GameScene(app);

    this.tableSelectScene = new TableSelectScene(
      app,
      () => this.gameScene.getRoundManager().playerBalance,
    );

    this.tableSelectScene.onTableSelected = (bet) => {
      this.tableSelectScene.hide();
      this.gameScene.show(bet);
    };

    this.gameScene.onLeaveTable = () => {
      this.gameScene.hide();
      this.tableSelectScene.show();
    };
  }

  start() {
    this.lobbyScene.show(() => {
      this.lobbyScene.hide();
      this.rulesScene.show(() => {
        this.rulesScene.hide();
        this.tableSelectScene.show();
      });
    });
  }

  onResize(width: number, height: number) {
    this.gameScene.onResize(width, height);
    this.lobbyScene.onResize(width, height);
    this.rulesScene.onResize(width, height);
    this.tableSelectScene.onResize(width, height);
  }
}
