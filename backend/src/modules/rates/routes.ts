import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError } from "../../utils/ApiError";
import { requireAuth } from "../../middleware/auth";
import { getRates, refreshLiveRates, setOverrides } from "../../services/rates";

const router = Router();
router.use(requireAuth);

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: await getRates() });
  }),
);

router.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const result = await refreshLiveRates();
    if (!result.ok) throw new ApiError(502, result.error || "Could not refresh rates");
    res.json({ success: true, data: await getRates() });
  }),
);

router.put(
  "/overrides",
  asyncHandler(async (req, res) => {
    const raw: unknown = (req.body as Record<string, unknown>)?.overrides ?? {};
    const input: Record<string, number | null> = {};
    if (typeof raw === "object" && raw !== null) {
      for (const [cur, val] of Object.entries(raw as Record<string, unknown>)) {
        if (typeof val === "number" && val > 0) input[cur] = val;
        else if (val === null) input[cur] = null;
      }
    }
    await setOverrides(input);
    res.json({ success: true, data: await getRates() });
  }),
);

export default router;
