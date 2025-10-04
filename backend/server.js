const express = require("express");
const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");
const cors = require("cors");
dotenv.config();

const dietRoutes = require("./routes/dietRoutes");

const app = express();

app.use(cors({
  origin: "*",
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"]
}));

app.use(express.json());


// serve api routes
app.use("/api/diet", dietRoutes);

// serve frontend static files
const frontendPath = path.join(__dirname, "..", "frontend");
app.use(express.static(frontendPath));

app.get("/", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
