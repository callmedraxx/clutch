import { Router, Request, Response } from 'express';

const router = Router();

/**
 * @swagger
 * /api:
 *   get:
 *     summary: API information endpoint
 *     tags: [API]
 *     responses:
 *       200:
 *         description: API information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Clutch Backend API
 *                 version:
 *                   type: string
 *                   example: 1.0.0
 */
router.get('/', (_req: Request, res: Response) => {
  res.json({
    message: 'Clutch Backend API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

export default router;

