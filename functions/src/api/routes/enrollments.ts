import {Router} from "express";
import {validateAuth} from "../middleware/auth.js";
import {validateBody} from "../middleware/validate.js";
import {checkRateLimit} from "../middleware/rateLimit.js";
import {WakeApiServerError} from "../errors.js";
import {COURSE_ID_RE} from "../services/paymentHelpers.js";
import {
  leaveOneOnOneEnrollment,
  LEAVE_REASONS,
  type LeaveReason,
} from "../services/enrollmentLeave.js";

const router = Router();

// POST /enrollments/:courseId/leave — user-initiated leave for one-on-one programs
router.post("/enrollments/:courseId/leave", async (req, res) => {
  const auth = await validateAuth(req);
  await checkRateLimit(auth.userId, 200, "rate_limit_first_party");

  const {courseId} = req.params;
  if (!COURSE_ID_RE.test(courseId)) {
    throw new WakeApiServerError("VALIDATION_ERROR", 400, "courseId inválido", "courseId");
  }

  const body = validateBody<{
    reason: string;
    satisfaction?: number;
    freeText?: string;
  }>({
    reason: "string",
    satisfaction: "optional_number",
    freeText: "optional_string",
  }, req.body);

  if (!LEAVE_REASONS.includes(body.reason as LeaveReason)) {
    throw new WakeApiServerError(
      "VALIDATION_ERROR", 400,
      "reason inválido",
      "reason"
    );
  }

  if (body.satisfaction != null && (body.satisfaction < 1 || body.satisfaction > 5)) {
    throw new WakeApiServerError(
      "VALIDATION_ERROR", 400,
      "satisfaction debe estar entre 1 y 5",
      "satisfaction"
    );
  }

  const result = await leaveOneOnOneEnrollment({
    userId: auth.userId,
    courseId,
    reason: body.reason as LeaveReason,
    satisfaction: body.satisfaction ?? null,
    freeText: body.freeText ?? null,
  });

  res.json({
    data: {
      courseId,
      endedAt: result.endedAt,
      cascade: result.cascade,
    },
  });
});

export default router;
