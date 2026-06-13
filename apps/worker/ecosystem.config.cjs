module.exports = {
  apps: [
    {
      name: "comfyui",
      script: "C:\\AI\\ComfyUI\\venv\\Scripts\\python.exe",
      args: "main.py --listen 127.0.0.1 --port 8188",
      cwd: "C:\\AI\\ComfyUI",
      interpreter: "none"
    },
    {
      name: "images-xedoc-worker",
      script: "dist/index.js",
      cwd: "C:\\Projects\\images.xedoc.ru\\apps\\worker",
      interpreter: "node",
      env: {
        WORKER_SERVER_URL: "https://images.xedoc.ru",
        WORKER_SECRET: "change_me",
        COMFYUI_URL: "http://127.0.0.1:8188",
        WORKER_NAME: "home-4070ti",
        WORKER_CONCURRENCY: "1",
        COMFYUI_WORKFLOW_ROOT: "C:\\Projects\\images.xedoc.ru"
      }
    }
  ]
};
