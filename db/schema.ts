import {sqliteTable,text,integer,uniqueIndex,index} from 'drizzle-orm/sqlite-core';
import {sql} from 'drizzle-orm';
export const kitchenRuns=sqliteTable('kitchen_runs',{
 id:text('id').primaryKey(),owner:text('owner').notNull(),title:text('title').notNull(),status:text('status').notNull(),paused:integer('paused').notNull().default(0),state:text('state').notNull(),lease:text('lease'),leaseUntil:integer('lease_until'),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull()
},t=>[index('kitchen_owner_date').on(t.owner,t.createdAt),uniqueIndex('kitchen_one_active').on(t.owner).where(sql`${t.status} in ('ready','running')`)]);
export const kitchenKeys=sqliteTable('kitchen_keys',{owner:text('owner').primaryKey(),ciphertext:text('ciphertext').notNull(),iv:text('iv').notNull(),updatedAt:text('updated_at').notNull()});
