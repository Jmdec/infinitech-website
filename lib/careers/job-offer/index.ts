// File: lib/careers/job-offer/index.ts

export * from "./types";
export * from "./constants";
export * from "./buildOffer";
export {
  pickJobDescription,
  JOBS_BY_DEPARTMENT,
  DEPARTMENT_LABELS,
} from "./departments";
export { IT_JOBS } from "./departments/it";
export { MARKETING_JOBS } from "./departments/marketing";
export { CREATIVE_JOBS } from "./departments/creative";
export { ADMIN_JOBS } from "./departments/admin";
