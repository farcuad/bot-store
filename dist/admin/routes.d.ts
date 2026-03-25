import type { Request, Response, NextFunction } from "express";
declare const router: import("express-serve-static-core").Router;
/** Middleware que protege todas las rutas a excepción de /login */
export declare function requireAuth(req: Request, res: Response, next: NextFunction): void;
export default router;
//# sourceMappingURL=routes.d.ts.map