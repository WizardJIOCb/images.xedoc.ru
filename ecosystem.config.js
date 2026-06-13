module.exports = {
  apps: [
    {
      name: "images-xedoc-server",
      script: "dist/index.js",
      cwd: "/var/www/images.xedoc.ru/apps/server",
      env: {
        NODE_ENV: "production",
        PORT: 3025
      }
    },
    {
      name: "images-xedoc-worker",
      script: "dist/index.js",
      cwd: "/var/www/images.xedoc.ru/apps/worker",
      env: {
        NODE_ENV: "production"
      }
    }
  ]
}
