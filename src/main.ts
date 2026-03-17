import { Application } from 'pixi.js';
import { Game } from './Game';

const MAX_APP_WIDTH = 430;

function getAppWidth() {
  return Math.min(window.innerWidth, MAX_APP_WIDTH);
}

function bootstrap() {
  const appW = getAppWidth();
  const appH = window.innerHeight;

  const app = new Application({
    width: appW,
    height: appH,
    backgroundColor: 0x0a0a1a,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });

  const canvas = app.view as HTMLCanvasElement;
  canvas.id = 'game-canvas';
  document.body.appendChild(canvas);

  const game = new Game(app);
  game.start();

  window.addEventListener('resize', () => {
    const w = getAppWidth();
    const h = window.innerHeight;
    app.renderer.resize(w, h);
    game.onResize(w, h);
  });
}

bootstrap();
