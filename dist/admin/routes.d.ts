import type { Request, Response, NextFunction } from "express";
declare const router: import("express-serve-static-core").Router;
export interface UserProfile {
    uid: string;
    email: string;
    displayName: string;
    phone: string;
    role: "user" | "admin";
    status: "pending" | "approved" | "rejected";
    maxBots: number;
    createdAt: number;
    approvedAt?: number;
}
declare global {
    namespace Express {
        interface Request {
            firebaseUid?: string;
            isAdmin?: boolean;
        }
    }
}
/**
 * Verifies the Firebase Bearer ID Token and attaches req.firebaseUid.
 * Also sets req.isAdmin = true when the user has role "admin" in Firestore.
 */
export declare function requireFirebaseAuth(req: Request, res: Response, next: NextFunction): Promise<void>;
/**
 * Verifies the Firebase user has role 'admin' in Firestore.
 */
export declare function requireAdminRole(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function requireAuth(req: Request, res: Response, next: NextFunction): void;
export default router;
//# sourceMappingURL=routes.d.ts.map