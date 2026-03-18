import { Application } from 'pixi.js';
import { SocketClient } from './network/SocketClient';
import { LobbyScene } from './scenes/LobbyScene';
import { GameModeSelectScene } from './scenes/GameModeSelectScene';
import { GameScene } from './scenes/GameScene';
import { TapGameScene } from './scenes/TapGameScene';

export class Game {
  private app: Application;
  private socket: SocketClient;
  private lobbyScene: LobbyScene;
  private modeSelectScene: GameModeSelectScene;
  private gameScene: GameScene;
  private tapGameScene: TapGameScene;

  constructor(app: Application) {
    this.app = app;
    this.socket = new SocketClient();
    this.lobbyScene = new LobbyScene(app, this.socket);
    this.modeSelectScene = new GameModeSelectScene(app);
    this.gameScene = new GameScene(app, this.socket);
    this.tapGameScene = new TapGameScene(app, this.socket);

    this.modeSelectScene.onModeSelected = (mode) => {
      this.modeSelectScene.hide();
      if (mode === 'crash') {
        this.gameScene.show();
      } else {
        this.tapGameScene.show();
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
    this.socket.connect();
    this.lobbyScene.show((nickname) => {
      const nick = nickname || `Player${Math.floor(Math.random() * 9999)}`;
      this.socket.send({ type: 'setNickname', nickname: nick });

      this.socket.on('welcome', () => {
        this.lobbyScene.hide();
        this.modeSelectScene.show();
      });
    });
  }

  onResize(width: number, height: number) {
    this.gameScene.onResize(width, height);
    this.tapGameScene.onResize(width, height);
    this.lobbyScene.onResize(width, height);
    this.modeSelectScene.onResize(width, height);
  }
}
