"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const healthCheck_controller_1 = require("../../controller/healthCheck/healthCheck.controller");
const healthCheckRouter = (0, express_1.Router)();
healthCheckRouter.get("/healthCheck", healthCheck_controller_1.getHealthCheckStatus);
exports.default = healthCheckRouter;
