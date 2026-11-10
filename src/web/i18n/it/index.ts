import type { MessageKey } from "../en/index.js";
import common from "./common.js";
import home from "./home.js";
import auth from "./auth.js";
import account from "./account.js";
import connect from "./connect.js";
import admin from "./admin.js";
import oauth from "./oauth.js";
import legal from "./legal.js";

export const messages: Partial<Record<MessageKey, string>> = { ...common, ...home, ...auth, ...account, ...connect, ...admin, ...oauth, ...legal };
