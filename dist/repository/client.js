"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.oiBusinessCategories = void 0;
const db_config_js_1 = __importDefault(require("../db/db.config.js"));
class OiBusinessCategories {
    create(data) {
        return __awaiter(this, void 0, void 0, function* () {
            return db_config_js_1.default.client.create({ data });
        });
    }
    delete(id) {
        return __awaiter(this, void 0, void 0, function* () {
            return db_config_js_1.default.client.delete({ where: { id } });
        });
    }
    update(id, data) {
        return __awaiter(this, void 0, void 0, function* () {
            return db_config_js_1.default.client.update({ where: { id }, data });
        });
    }
    findAll() {
        return __awaiter(this, arguments, void 0, function* (skip = 0, take = 10) {
            return db_config_js_1.default.client.findMany({ skip, take });
        });
    }
    findAllWithoutPagination() {
        return __awaiter(this, void 0, void 0, function* () {
            return db_config_js_1.default.client.findMany();
        });
    }
    count() {
        return __awaiter(this, void 0, void 0, function* () {
            return db_config_js_1.default.client.count();
        });
    }
    findById(id) {
        return __awaiter(this, void 0, void 0, function* () {
            return db_config_js_1.default.client.findFirst({ where: { id } });
        });
    }
    findByName(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            return db_config_js_1.default.client.findFirst({ where: { userId } });
        });
    }
}
exports.oiBusinessCategories = new OiBusinessCategories();
