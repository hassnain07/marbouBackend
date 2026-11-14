import { z } from 'zod';
import { paginationQuerySchema } from '../../../../common/dto/pagination.dto';

export const auditFilterSchema = paginationQuerySchema.extend({
  entity: z.string().optional(),
  entityId: z.string().optional(),
  actorId: z.string().optional(),
  action: z.string().optional(),
  fromDate: z.string().datetime({ offset: true }).optional(),
  toDate: z.string().datetime({ offset: true }).optional(),
});
export type AuditFilterDto = z.infer<typeof auditFilterSchema>;
