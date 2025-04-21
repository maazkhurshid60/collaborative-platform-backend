import morgan from "morgan";
import logger from "../utils/logger";
import { MORGRAN_FORMAT } from "../utils/constants";

export default morgan(MORGRAN_FORMAT, {
    stream: {
        write: (message) => {
            const logObject = {
                method: message.split(" ")[0],
                url: message.split(" ")[1],
                status: message.split(" ")[2],
                responseTime: message.split(" ")[3],
            };
            logger.info(JSON.stringify(logObject));
        },
    },
});