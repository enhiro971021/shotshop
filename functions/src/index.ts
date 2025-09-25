import {onRequest} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";

export const helloV2 = onRequest((request, response) => {
  logger.info("helloV2 invoked", {method: request.method, path: request.path});
  response.send("Hello from helloV2");
});
