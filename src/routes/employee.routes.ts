import { Router } from "express";
import {
  getEmployees,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  createTemporaryEmployeeAssignment,
  createPermanentEmployeeAssignment,
  getEmployeeAssignmentHistory,
  
} from "../controllers/employee.controller";

import { authenticateToken } from "../middlewares/auth.middleware";
import { authorizeRoles } from "../middlewares/authorize.middleware";

const router = Router();

// Any logged-in user can view employes
router.get(
  "/", 
  authenticateToken, 
  getEmployees);


// Only authorized managemnt users can create/update/delete employees
router.post(
  "/",
  authenticateToken,
  authorizeRoles("Administrator", "EME Area Manager"),
  createEmployee
);

router.put(
  "/:id",
  authenticateToken,
  authorizeRoles("Administrator", "EME Area Manager"),
  updateEmployee
);

router.delete(
  "/:id",
  authenticateToken,
  authorizeRoles("Administrator"),
  deleteEmployee
);

// Employee assignment APIs
router.post(
  "/:id/assignments/temporary",
  authenticateToken,
  authorizeRoles("Administrator", "EME Area Manager"),
  createTemporaryEmployeeAssignment
);

router.post(
  "/:id/assignments/permanent",
  authenticateToken,
  authorizeRoles("Administrator", "EME Area Manager"),
  createPermanentEmployeeAssignment
);

router.get(
  "/:id/assignments",
  authenticateToken,
  getEmployeeAssignmentHistory
);

export default router;