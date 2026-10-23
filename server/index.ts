import { createServer } from "node:http";
import { createServer as createVite } from "vite";

const PORT = Number(process.env.PORT ?? 4317);

const vite = await createVite({ server: { middlewareMode: true }, appType: "mpa" });

const server = createServer((req, res) => {
  if (req.url === "/gallery" || req.url?.startsWith("/gallery?")) req.url = req.url.replace("/gallery", "/gallery.html");
  vite.middlewares(req, res);
});

server.listen(PORT, () => console.log(`Agent Office → http://localhost:${PORT}  (galerie: /gallery)`));
