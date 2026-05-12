if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

const express = require("express");
const app = express();
const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");
const methodOverride = require("method-override");
const ejsMate = require("ejs-mate");
const ExpressError = require("./utils/ExpressError");
const session = require("express-session");
const flash = require("connect-flash");
const passport = require("passport");
const LocalStrategy = require("passport-local");
const { spawn } = require("child_process");

const User = require("./models/user");
const {
  configureSocialAuthStrategies,
  getSocialAuthDiagnostics,
  strategyEnabled,
} = require("./utils/socialAuth");
const { themeMiddleware } = require("./middleware");
const { refreshBookingSafetyStates } = require("./utils/bookingSafety");

const listingsRouter = require("./routes/listing");
const reviewRouter = require("./routes/review");
const userRouter = require("./routes/user");
const profileRouter = require("./routes/profile");
const apiListingsRouter = require("./routes/listings");
const categoriesRouter = require("./routes/categories");
const adminRouter = require("./routes/admin");
const adminPageRouter = require("./routes/adminPages");
const adminApiRouter = require("./routes/adminApi");
const newDashboardRouter = require("./routes/newDashboard");
const bookingRoutes = require("./routes/booking");

const isVercelRuntime = Boolean(process.env.VERCEL || process.env.VERCEL_URL);
const enableBackgroundWorkers = !isVercelRuntime;
let dbConnectPromise = null;

function connectDatabase() {
  if (mongoose.connection.readyState === 1) return Promise.resolve(mongoose.connection);
  if (dbConnectPromise) return dbConnectPromise;
  if (!process.env.ATLASDB_URL) {
    console.warn("ATLASDB_URL is missing. Database connection was skipped.");
    return Promise.resolve(null);
  }

  dbConnectPromise = mongoose
    .connect(process.env.ATLASDB_URL)
    .then(async () => {
      console.log("MongoDB connected");

      if (!enableBackgroundWorkers) return mongoose.connection;

      try {
        await refreshBookingSafetyStates();
        if (!global.BOOKING_SAFETY_REFRESH_STARTED) {
          global.BOOKING_SAFETY_REFRESH_STARTED = true;
          setInterval(() => {
            refreshBookingSafetyStates().catch((error) => {
              console.error("Booking safety refresh error:", error.message || error);
            });
          }, 1000 * 60 * 15);
        }
      } catch (error) {
        console.error("Initial booking safety refresh error:", error.message || error);
      }

      return mongoose.connection;
    })
    .catch((err) => {
      dbConnectPromise = null;
      console.log("DB Connection Error:", err);
      return null;
    });

  return dbConnectPromise;
}

connectDatabase().catch((error) => {
  console.error("Unexpected DB bootstrap error:", error.message || error);
});

const pythonScriptPath = path.join(__dirname, "python_service", "app.py");
const venvPythonPath = path.join(__dirname, "python_service", "venv", "Scripts", "python.exe");
if (enableBackgroundWorkers && process.env.ENABLE_PYTHON_WORKER !== "false" && !global.PY_WORKER_STARTED) {
  global.PY_WORKER_STARTED = true;
  try {
    const pythonExec = fs.existsSync(venvPythonPath) ? venvPythonPath : "python";
    spawn(pythonExec, [pythonScriptPath], { stdio: "inherit" });
    console.log("Python AI Worker Started");
  } catch (err) {
    console.warn("Could not start python worker:", err.message || err);
  }
}

app.engine("ejs", ejsMate);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride("_method"));
app.use(express.static(path.join(__dirname, "public")));
app.use(async (_req, _res, next) => {
  try {
    await connectDatabase();
    next();
  } catch (error) {
    next(error);
  }
});

const sessionConfig = {
  secret: process.env.SESSION_SECRET || "mysupersecretcode",
  resave: false,
  saveUninitialized: true,
  cookie: { httpOnly: true, maxAge: 1000 * 60 * 60 * 24 * 7 },
};

app.use(session(sessionConfig));
app.use(flash());
app.use(passport.initialize());
app.use(passport.session());
passport.use(new LocalStrategy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());
configureSocialAuthStrategies(passport);

const socialAuthDiagnostics = getSocialAuthDiagnostics();
if (process.env.NODE_ENV !== "production") {
  console.log("[SocialAuth] Callback URLs:", socialAuthDiagnostics.callbacks);
}

app.use("/bookings", bookingRoutes);
app.use("/receipts", express.static(path.join(__dirname, "receipts")));

app.use(themeMiddleware);
app.use((req, res, next) => {
  res.locals.success = req.flash("success");
  res.locals.error = req.flash("error");
  res.locals.currUser = req.user || null;
  res.locals.q = "";
  res.locals.location = "";
  res.locals.min = "";
  res.locals.max = "";
  res.locals.category = "";
  res.locals.socialAuthEnabled = {
    google: strategyEnabled("google"),
    facebook: strategyEnabled("facebook"),
    linkedin: strategyEnabled("linkedin"),
    apple: strategyEnabled("apple"),
  };
  res.locals.socialAuthDiagnostics = socialAuthDiagnostics;
  next();
});

app.use("/admin/api", adminApiRouter);
app.use("/admin", adminPageRouter);
app.use("/admin", adminRouter);
app.use("/", newDashboardRouter);

app.use("/profile", profileRouter);
app.use("/api/listings", apiListingsRouter);
app.use("/api/categories", categoriesRouter);
app.use("/listings", listingsRouter);
app.use("/listings/:id/reviews", reviewRouter);
app.use("/", userRouter);

app.all("*", (req, res, next) => next(new ExpressError(404, "Page Not Found")));
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  if (!err.message) err.message = "Something went wrong!";
  res.status(statusCode).render("error", { message: err.message });
});

const http = require("http");
const server = http.createServer(app);

const socketUtil = require("./utils/socket");
socketUtil.init(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
  },
});

const PORT = process.env.PORT || 8080;
if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Server Running on http://localhost:${PORT}`);
  });
}

module.exports = app;
module.exports.server = server;
module.exports.connectDatabase = connectDatabase;
