/** All English texts: the source language and the fallback for missing translations. */
import common from "./common.js";
import home from "./home.js";
import auth from "./auth.js";
import account from "./account.js";
import connect from "./connect.js";
import admin from "./admin.js";
import oauth from "./oauth.js";
import legal from "./legal.js";

export const en = { ...common, ...home, ...auth, ...account, ...connect, ...admin, ...oauth, ...legal };
export type MessageKey = keyof typeof en;
