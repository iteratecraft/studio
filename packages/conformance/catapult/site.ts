// Where the CATAPULT that up.ts starts answers, and its CTS's first user (test only); shared by
// up.ts, which Node.js runs as it is, and the tests.

/** The CTS and the player behind one origin (nginx.conf). */
export const CATAPULT_URL = `http://localhost:${process.env.CATAPULT_PORT ?? "8280"}`;

/** The CTS's first user, made by up.ts. */
export const CTS_USER = { username: "admin", password: "Admin-pass-1" };
