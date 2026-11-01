import express from "express";

const PORT = Number(process.env.PORT ?? 3002);

const app = express();

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", service: "sandbox-upstream" });
});

app.listen(PORT, () => {
  console.log(JSON.stringify({ level: "info", message: "Sandbox Upstream listening", port: PORT }));
});
