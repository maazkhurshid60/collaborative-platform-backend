"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_controller_1 = require("../../controller/client/client.controller");
const clientRouter = (0, express_1.Router)();
clientRouter.delete("/delete-client", client_controller_1.deletClient);
clientRouter.patch("/update-client", client_controller_1.updateClient);
clientRouter.get("/get-all-clients", client_controller_1.getAllClients);
exports.default = clientRouter;
