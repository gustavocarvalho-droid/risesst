module.exports = (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.status(200).json({
    status: "ok",
    message: "API Rise SST funcionando!",
    env: {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY 
        ? "✅ Configurada (" + process.env.ANTHROPIC_API_KEY.slice(0,12) + "...)" 
        : "❌ NÃO CONFIGURADA",
      NODE_ENV: process.env.NODE_ENV || "não definido",
      VERCEL: process.env.VERCEL ? "✅ Rodando na Vercel" : "local",
    },
    timestamp: new Date().toISOString()
  });
};
