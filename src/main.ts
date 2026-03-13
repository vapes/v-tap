import { Application } from 'pixi.js';
import { Game } from './Game';

function bootstrap() {
  const app = new Application({
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: 0x0a0a1a,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });

  document.body.appendChild(app.view as HTMLCanvasElement);

  const game = new Game(app);
  game.start();

  window.addEventListener('resize', () => {
    app.renderer.resize(window.innerWidth, window.innerHeight);
    game.onResize(window.innerWidth, window.innerHeight);
  });
}

bootstrap();
