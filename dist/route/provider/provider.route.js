"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const provider_controller_1 = require("../../controller/provider/provider.controller");
const providerRouter = (0, express_1.Router)();
providerRouter.delete("/delete-provider", provider_controller_1.deletProvider);
providerRouter.patch("/update-provider", provider_controller_1.updateProvider);
providerRouter.get("/get-all-providers", provider_controller_1.getAllProviders);
exports.default = providerRouter;
