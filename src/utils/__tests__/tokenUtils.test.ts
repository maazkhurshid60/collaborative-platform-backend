import jwt from "jsonwebtoken";
import { verifyToken } from "../../utils/tokenUtils";

describe("tokenUtils", () => {
    const secret = "test-secret";

    beforeAll(() => {
        process.env.ACCESS_TOKEN_SECRET = secret;
    });

    it("should verify and decode a valid token", () => {
        const payload = { id: "123", email: "test@test.com", role: "user" };
        const token = jwt.sign(payload, secret);

        const decoded = verifyToken(token);
        expect(decoded).toMatchObject(payload);
    });

    it("should throw an error for an invalid token", () => {
        expect(() => verifyToken("invalid-token")).toThrow("Invalid or expired token");
    });

    it("should throw an error if secret is missing", () => {
        delete process.env.ACCESS_TOKEN_SECRET;
        const token = jwt.sign({ id: "123" }, secret);

        expect(() => verifyToken(token)).toThrow("Access token secret not set in environment variables");

        // Restore secret for other tests
        process.env.ACCESS_TOKEN_SECRET = secret;
    });
});
