import { Elysia } from 'elysia';
import { getIndicators } from '../services/indicators';

export const indicatorRoutes = new Elysia().get('/indicators', () => getIndicators());
