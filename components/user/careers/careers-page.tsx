"use client";

import Image from "next/image";
import Link from "next/link";
import {
  type ChangeEvent,
  type CSSProperties,
  type DragEvent,
  type FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowDown,
  ArrowRight,
  BriefcaseBusiness,
  Check,
  Clock3,
  FileText,
  GraduationCap,
  HeartHandshake,
  Lightbulb,
  LoaderCircle,
  MapPin,
  Rocket,
  Sparkles,
  Target,
  UploadCloud,
  UsersRound,
  X,
} from "lucide-react";

type JobListing = {
  id: number;
  title: string;
  department: string;
  employment_type: string;
  description: string;
  qualifications: string[];
};

type ApplicationForm = {
  fullName: string;
  email: string;
  phone: string;
  address: string;
  cityProvince: string;
  positionId: string;
  employmentType: string;
  expectedSalary: string;
  education: string;
  school: string;
  course: string;
  graduationYear: string;
  employmentStatus: string;
  unemploymentReason: string;
  yearsExperience: string;
  previousCompany: string;
  skills: string;
  introduction: string;
  whyInfinitech: string;
  portfolioUrl: string;
  linkedinUrl: string;
  consent: boolean;
};

type ApiResponse = {
  message?: string;
  reference?: string;
  notifications_pending?: boolean;
  data?: JobListing[];
  errors?: Record<string, string[]>;
};

const EMPLOYMENT_TYPES = ["Full-time", "Internship"];
const EDUCATION_LEVELS = [
  "High school",
  "Vocational",
  "Bachelor's degree",
  "Master's degree",
  "Doctorate",
  "Other",
];
const EMPLOYMENT_STATUSES = ["Employed", "Unemployed", "Freelance", "Student"];
const EXPERIENCE_LEVELS = [
  "Less than 1 year",
  "1–2 years",
  "3–5 years",
  "6–9 years",
  "10+ years",
];
const MIN_GRADUATION_YEAR = 1950;
const GRADUATION_YEAR_LOOKAHEAD = 10;
type ApplicationFieldErrors = Partial<
  Record<keyof ApplicationForm | "resume", string>
>;
const APPLICATION_STEP_FIELDS: Record<
  number,
  (keyof ApplicationForm | "resume")[]
> = {
  0: ["fullName", "email", "phone", "address", "cityProvince"],
  1: ["positionId", "employmentType", "expectedSalary"],
  2: ["education", "school", "course", "graduationYear"],
  3: [
    "employmentStatus",
    "unemploymentReason",
    "yearsExperience",
    "previousCompany",
    "skills",
    "introduction",
    "whyInfinitech",
  ],
  4: ["resume", "portfolioUrl", "linkedinUrl", "consent"],
};
const APPLICATION_STEPS = [
  { title: "Personal details" },
  { title: "Position details" },
  { title: "Education" },
  { title: "Experience" },
  { title: "Resume & consent" },
];

const initialForm: ApplicationForm = {
  fullName: "",
  email: "",
  phone: "",
  address: "",
  cityProvince: "",
  positionId: "",
  employmentType: "Full-time",
  expectedSalary: "",
  education: "",
  school: "",
  course: "",
  graduationYear: "",
  employmentStatus: "",
  unemploymentReason: "",
  yearsExperience: "",
  previousCompany: "",
  skills: "",
  introduction: "",
  whyInfinitech: "",
  portfolioUrl: "",
  linkedinUrl: "",
  consent: false,
};

const GRID_BG: CSSProperties = {
  backgroundImage:
    "linear-gradient(rgba(56,189,248,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,0.06) 1px, transparent 1px)",
  backgroundSize: "40px 40px",
  maskImage: "radial-gradient(ellipse at 50% 0%, black 30%, transparent 75%)",
  WebkitMaskImage:
    "radial-gradient(ellipse at 50% 0%, black 30%, transparent 75%)",
};

const inputClass =
  "mt-2 block w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10";
const labelClass = "text-sm font-semibold text-slate-800";

// Formats a date as YYYY-MM-DD in the visitor's local time, for <input type="date">.
// Lets people type "linkedin.com/in/name" without the scheme. Anything that already
// has a scheme (including javascript:) is left alone and then rejected by validateUrl.
function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function validateUrl(value: string, requiredHost?: string): boolean {
  const normalized = normalizeUrl(value);
  if (!normalized) return true;
  try {
    const url = new URL(normalized);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    if (!host.includes(".")) return false;
    if (requiredHost) {
      return host === requiredHost || host.endsWith(`.${requiredHost}`);
    }
    return true;
  } catch {
    return false;
  }
}

// No consecutive dots, no leading or trailing dot, and a top-level domain of 2+ letters.
const EMAIL_PATTERN =
  /^[^\s@.]+(?:\.[^\s@.]+)*@[^\s@.]+(?:\.[^\s@.]+)*\.[A-Za-z]{2,}$/;

// Philippine numbers, written without the country code or the leading 0:
//   mobile:   9XX XXX XXXX (10 digits)
//   landline: area code + local number (9 digits, e.g. 2 8123 4567 or 32 123 4567)
const PH_MOBILE = /^9\d{9}$/;
const PH_LANDLINE = /^[2-8]\d{8}$/;

// Keeps only characters that can appear in a phone number, with "+" only at the start.
// This also cleans up pasted text, so letters can never end up in the field.
function sanitizePhoneInput(value: string): string {
  const cleaned = value.replace(/[^\d\s+().-]/g, "");
  const hasLeadingPlus = cleaned.trimStart().startsWith("+");
  const body = cleaned.replace(/\+/g, "").trimStart();
  return (hasLeadingPlus ? "+" : "") + body;
}

type PhoneCheck =
  | { valid: true; normalized: string }
  | { valid: false; message: string };

// Accepts Philippine mobile and landline numbers in the usual spellings
// (0917 123 4567, +63 917 123 4567, 639171234567, (02) 8123 4567) and
// international numbers that start with + and a country code.
// `normalized` is the number in international format, such as +639171234567.
function checkPhone(raw: string): PhoneCheck {
  const phone = raw.trim();
  const invalid = (message: string): PhoneCheck => ({ valid: false, message });

  if (!/^\+?[\d\s().-]+$/.test(phone)) {
    return invalid("Use digits only, with an optional + at the start.");
  }
  const opens = (phone.match(/\(/g) ?? []).length;
  const closes = (phone.match(/\)/g) ?? []).length;
  if (
    opens !== closes ||
    opens > 1 ||
    (opens === 1 && phone.indexOf("(") > phone.indexOf(")"))
  ) {
    return invalid("Check the brackets in your phone number.");
  }

  const digits = phone.replace(/\D/g, "");
  if (/^(\d)\1+$/.test(digits)) {
    return invalid("Enter a real phone number.");
  }

  const philippineHelp =
    "Enter a valid Philippine number, such as 0917 123 4567 or +63 917 123 4567.";
  let national: string;
  let allowLandline = true;

  if (phone.startsWith("+") && !digits.startsWith("63")) {
    // Other countries: up to 15 digits including the country code.
    if (digits.length < 8 || digits.length > 15 || digits.startsWith("0")) {
      return invalid(
        "Enter an international number with its country code, such as +65 6123 4567.",
      );
    }
    return { valid: true, normalized: `+${digits}` };
  }

  if (phone.startsWith("+") || digits.startsWith("63")) {
    national = digits.slice(2);
    // People often write +63 0917…; drop the extra 0.
    if (national.startsWith("0")) national = national.slice(1);
  } else if (digits.startsWith("0")) {
    national = digits.slice(1);
  } else {
    national = digits;
    // Without 0, +63, or 63, only a mobile number is unambiguous.
    allowLandline = false;
  }

  if (PH_MOBILE.test(national) || (allowLandline && PH_LANDLINE.test(national))) {
    return { valid: true, normalized: `+63${national}` };
  }
  return invalid(philippineHelp);
}

function validateApplicationStep(
  form: ApplicationForm,
  step: number,
  jobs: JobListing[],
  resume: File | null,
  maxGraduationYear: number,
): ApplicationFieldErrors {
  const errors: ApplicationFieldErrors = {};
  const requiredText = (
    field: keyof ApplicationForm,
    label: string,
    maxLength: number,
  ) => {
    const value = String(form[field]).trim();
    if (!value) errors[field] = `${label} is required.`;
    else if (value.length > maxLength) {
      errors[field] = `${label} must be ${maxLength} characters or fewer.`;
    }
  };

  if (step === 0) {
    requiredText("fullName", "Full name", 255);
    if (form.fullName.trim() && !/\p{L}/u.test(form.fullName)) {
      errors.fullName = "Enter your full name.";
    }
    requiredText("email", "Email address", 255);
    if (form.email.trim() && !errors.email && !EMAIL_PATTERN.test(form.email.trim())) {
      errors.email = "Enter a valid email address.";
    }
    requiredText("phone", "Contact number", 50);
    if (form.phone.trim() && !errors.phone) {
      const phoneCheck = checkPhone(form.phone);
      if (!phoneCheck.valid) errors.phone = phoneCheck.message;
    }
    requiredText("address", "Current address", 1000);
    requiredText("cityProvince", "City / Province", 160);
  }

  if (step === 1) {
    if (
      form.positionId &&
      !jobs.some((job) => String(job.id) === form.positionId)
    ) {
      errors.positionId =
        "Choose an available position or General Application.";
    }
    if (!EMPLOYMENT_TYPES.includes(form.employmentType)) {
      errors.employmentType = "Choose a valid employment type.";
    }
    if (form.expectedSalary.trim().length > 100) {
      errors.expectedSalary =
        "Expected salary must be 100 characters or fewer.";
    }
  }

  if (step === 2) {
    if (!EDUCATION_LEVELS.includes(form.education)) {
      errors.education = "Choose your highest educational attainment.";
    }
    requiredText("school", "School / University", 255);
    requiredText("course", "Course / Degree", 255);
    // Digits only: Number() would accept values such as "2e3" from a number input.
    const yearText = form.graduationYear.trim();
    const year = Number(yearText);
    if (
      !/^\d{4}$/.test(yearText) ||
      year < MIN_GRADUATION_YEAR ||
      year > maxGraduationYear
    ) {
      errors.graduationYear = `Enter a graduation year between ${MIN_GRADUATION_YEAR} and ${maxGraduationYear}.`;
    }
  }

  if (step === 3) {
    if (!EMPLOYMENT_STATUSES.includes(form.employmentStatus)) {
      errors.employmentStatus = "Choose your employment status.";
    }
    if (form.employmentStatus === "Unemployed") {
      requiredText("unemploymentReason", "Reason for unemployment", 2000);
    }
    if (!EXPERIENCE_LEVELS.includes(form.yearsExperience)) {
      errors.yearsExperience = "Choose your years of experience.";
    }
    if (form.previousCompany.trim().length > 255) {
      errors.previousCompany =
        "Previous company must be 255 characters or fewer.";
    }
    requiredText("skills", "Relevant skills", 2000);
    requiredText("introduction", "Brief introduction", 5000);
    requiredText("whyInfinitech", "Why you want to join Infinitech", 5000);
  }

  if (step === 4) {
    if (!resume) errors.resume = "Please upload your resume before submitting.";
    if (
      form.portfolioUrl.trim().length > 2048 ||
      !validateUrl(form.portfolioUrl)
    ) {
      errors.portfolioUrl =
        "Enter a valid website URL, such as https://example.com.";
    }
    if (
      form.linkedinUrl.trim().length > 2048 ||
      !validateUrl(form.linkedinUrl, "linkedin.com")
    ) {
      errors.linkedinUrl =
        "Enter a valid LinkedIn URL, such as https://linkedin.com/in/your-name.";
    }
    if (!form.consent) {
      errors.consent = "You must agree to the privacy and recruitment consent.";
    }
  }

  return errors;
}

function createSubmissionKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    return (char === "x" ? random : (random & 0x3) | 0x8).toString(16);
  });
}

// Safely parse a JSON body. Returns {} when the server sends HTML or an empty body
// (for example a 502 page), so the friendly fallback messages still show.
async function readJson(response: Response): Promise<ApiResponse> {
  try {
    return (await response.json()) as ApiResponse;
  } catch {
    return {};
  }
}

function focusField(name: string) {
  document.querySelector<HTMLElement>(`[name="${name}"]`)?.focus();
}

function CareerField({
  label,
  name,
  value,
  onChange,
  type = "text",
  required = false,
  placeholder,
  autoComplete,
  min,
  max,
  maxLength,
  error,
  hint,
}: {
  label: string;
  name: keyof ApplicationForm;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
  autoComplete?: string;
  min?: number | string;
  max?: number | string;
  maxLength?: number;
  error?: string;
  hint?: string;
}) {
  const describedBy = error
    ? `${name}-error`
    : hint
      ? `${name}-hint`
      : undefined;
  return (
    <label className={labelClass}>
      {label}
      {required && (
        <span className="ml-1 text-amber-600" aria-hidden="true">
          *
        </span>
      )}
      <input
        className={`${inputClass} ${error ? "border-rose-500" : ""}`}
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        placeholder={placeholder}
        autoComplete={autoComplete}
        min={min}
        max={max}
        maxLength={maxLength}
        required={required}
      />
      {error ? (
        <span
          id={`${name}-error`}
          role="alert"
          className="mt-1 block text-xs font-medium text-rose-700"
        >
          {error}
        </span>
      ) : hint ? (
        <span
          id={`${name}-hint`}
          className="mt-1 block text-xs font-normal text-slate-500"
        >
          {hint}
        </span>
      ) : null}
    </label>
  );
}

function CareerSelect({
  label,
  name,
  value,
  onChange,
  options,
  required = false,
  error,
}: {
  label: string;
  name: keyof ApplicationForm;
  value: string;
  onChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  options: string[];
  required?: boolean;
  error?: string;
}) {
  return (
    <label className={labelClass}>
      {label}
      {required && (
        <span className="ml-1 text-amber-600" aria-hidden="true">
          *
        </span>
      )}
      <select
        className={`${inputClass} ${error ? "border-rose-500" : ""}`}
        name={name}
        value={value}
        onChange={onChange}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${name}-error` : undefined}
        required={required}
      >
        <option value="">Select an option</option>
        {options.map((option) => (
          <option value={option} key={option}>
            {option}
          </option>
        ))}
      </select>
      {error && (
        <span
          id={`${name}-error`}
          role="alert"
          className="mt-1 block text-xs font-medium text-rose-700"
        >
          {error}
        </span>
      )}
    </label>
  );
}

function CareerTextarea({
  label,
  name,
  value,
  onChange,
  required = false,
  placeholder,
  rows = 4,
  error,
  maxLength,
}: {
  label: string;
  name: keyof ApplicationForm;
  value: string;
  onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  required?: boolean;
  placeholder?: string;
  rows?: number;
  error?: string;
  maxLength?: number;
}) {
  return (
    <label className={labelClass}>
      {label}
      {required && (
        <span className="ml-1 text-amber-600" aria-hidden="true">
          *
        </span>
      )}
      <textarea
        className={`${inputClass} resize-y ${error ? "border-rose-500" : ""}`}
        name={name}
        value={value}
        onChange={onChange}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${name}-error` : undefined}
        placeholder={placeholder}
        rows={rows}
        maxLength={maxLength}
        required={required}
      />
      {error && (
        <span
          id={`${name}-error`}
          role="alert"
          className="mt-1 block text-xs font-medium text-rose-700"
        >
          {error}
        </span>
      )}
    </label>
  );
}

export default function CareersPage() {
  const [jobs, setJobs] = useState<JobListing[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [jobsError, setJobsError] = useState("");
  const [form, setForm] = useState<ApplicationForm>(initialForm);
  const [resume, setResume] = useState<File | null>(null);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [fileError, setFileError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<ApplicationFieldErrors>({});
  const [submitError, setSubmitError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [successReference, setSuccessReference] = useState("");
  const [notificationsPending, setNotificationsPending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submissionKey, setSubmissionKey] = useState("");
  const [currentStep, setCurrentStep] = useState(0);
  const resumeInputRef = useRef<HTMLInputElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const successRef = useRef<HTMLDivElement>(null);
  const stepHeadingRef = useRef<HTMLParagraphElement>(null);
  const previousStepRef = useRef(currentStep);
  // A field to focus once the step that contains it has rendered.
  const pendingFocusRef = useRef<string | null>(null);
  const prefersReducedMotion = useReducedMotion();
  const maxGraduationYear =
    new Date().getFullYear() + GRADUATION_YEAR_LOOKAHEAD;
  const lastStep = APPLICATION_STEPS.length - 1;

  useEffect(() => {
    const controller = new AbortController();
    const loadJobs = async () => {
      try {
        const response = await fetch("/api/careers/jobs", {
          signal: controller.signal,
          cache: "no-store",
        });
        const result = await readJson(response);
        if (!response.ok) {
          throw new Error(
            result.message || "We couldn't load current openings.",
          );
        }
        const loadedJobs = Array.isArray(result.data) ? result.data : [];
        setJobs(loadedJobs);
        setSelectedJobId((current) =>
          loadedJobs.some((job) => job.id === current)
            ? current
            : (loadedJobs[0]?.id ?? null),
        );
      } catch (error) {
        if (!controller.signal.aborted) {
          setJobsError(
            error instanceof Error
              ? error.message
              : "We couldn't load current openings.",
          );
        }
      } finally {
        if (!controller.signal.aborted) setJobsLoading(false);
      }
    };
    void loadJobs();
    return () => controller.abort();
  }, []);

  // Bring the success message into view and announce it after a successful submit.
  useEffect(() => {
    if (!submitted) return;
    successRef.current?.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "center",
    });
    successRef.current?.focus();
  }, [submitted, prefersReducedMotion]);

  // After the step changes, focus the field that needs fixing, or the step heading.
  useEffect(() => {
    if (previousStepRef.current === currentStep) return;
    previousStepRef.current = currentStep;
    if (submitted) return;
    const pending = pendingFocusRef.current;
    pendingFocusRef.current = null;
    const field = pending
      ? document.querySelector<HTMLElement>(`[name="${pending}"]`)
      : null;
    if (field) {
      field.focus();
      return;
    }
    stepHeadingRef.current?.focus({ preventScroll: true });
    stepHeadingRef.current?.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "nearest",
    });
  }, [currentStep, prefersReducedMotion, submitted]);

  const updateForm = (
    event: ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) => {
    const { name } = event.target;
    // Phone numbers are cleaned as people type or paste, so letters never get in.
    const value =
      name === "phone"
        ? sanitizePhoneInput(event.target.value)
        : event.target.value;
    setForm((current) => ({
      ...current,
      [name]: value,
      ...(name === "employmentStatus" && value !== "Unemployed"
        ? { unemploymentReason: "" }
        : {}),
    }));
    setSubmitError("");
    setFieldErrors((current) => {
      if (
        !current[name as keyof ApplicationFieldErrors] &&
        !(name === "employmentStatus" && value !== "Unemployed")
      ) {
        return current;
      }
      const next = { ...current };
      delete next[name as keyof ApplicationFieldErrors];
      if (name === "employmentStatus" && value !== "Unemployed") {
        delete next.unemploymentReason;
      }
      return next;
    });
  };

  // Validates only the visible step. Used by Continue.
  const validateStep = (step: number): boolean => {
    const errors = validateApplicationStep(
      form,
      step,
      jobs,
      resume,
      maxGraduationYear,
    );
    setFieldErrors((current) => {
      const next = { ...current };
      for (const field of APPLICATION_STEP_FIELDS[step] ?? []) {
        delete next[field];
      }
      return { ...next, ...errors };
    });
    const firstInvalidField = APPLICATION_STEP_FIELDS[step]?.find(
      (field) => errors[field],
    );
    if (firstInvalidField) {
      focusField(firstInvalidField);
      return false;
    }
    return true;
  };

  // Validates every step. Used before submitting, so nothing from an earlier step
  // can slip through, and jumps to the first step that has a problem.
  const validateAll = (): boolean => {
    const allErrors: ApplicationFieldErrors = {};
    let firstInvalidStep = -1;
    for (let step = 0; step < APPLICATION_STEPS.length; step += 1) {
      const errors = validateApplicationStep(
        form,
        step,
        jobs,
        resume,
        maxGraduationYear,
      );
      if (firstInvalidStep === -1 && Object.keys(errors).length > 0) {
        firstInvalidStep = step;
      }
      Object.assign(allErrors, errors);
    }
    setFieldErrors(allErrors);
    if (firstInvalidStep === -1) return true;

    const firstField = APPLICATION_STEP_FIELDS[firstInvalidStep].find(
      (field) => allErrors[field],
    );
    if (firstInvalidStep === currentStep) {
      if (firstField) focusField(firstField);
    } else {
      pendingFocusRef.current = firstField ?? null;
      setCurrentStep(firstInvalidStep);
    }
    return false;
  };

  const goToNextStep = () => {
    if (!validateStep(currentStep)) return;
    setCurrentStep((step) => Math.min(step + 1, lastStep));
  };

  const startAnotherApplication = () => {
    setSubmitted(false);
    setSuccessReference("");
    setNotificationsPending(false);
    setCurrentStep(0);
    document.getElementById("application-form")?.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "start",
    });
  };

  const applyFor = (job?: JobListing) => {
    setSubmitted(false);
    setSuccessReference("");
    setNotificationsPending(false);
    setSubmitError("");
    setFieldErrors({});
    setFileError("");
    setCurrentStep(0);
    setForm((current) => ({
      ...current,
      positionId: job ? String(job.id) : "",
      // Only accept values that match an <option>, otherwise the required
      // select would go blank and block submission.
      employmentType:
        job && EMPLOYMENT_TYPES.includes(job.employment_type)
          ? job.employment_type
          : current.employmentType,
    }));
    document.getElementById("application-form")?.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "start",
    });
  };

  const validateResume = (file: File | undefined): File | null => {
    if (!file) return null;
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!extension || !["pdf", "doc", "docx"].includes(extension)) {
      setFileError("Choose a PDF, DOC, or DOCX resume.");
      return null;
    }
    if (file.size === 0) {
      setFileError("That resume file is empty. Choose a different file.");
      return null;
    }
    if (file.size > 10 * 1024 * 1024) {
      setFileError("Your resume must be 10 MB or smaller.");
      return null;
    }
    setFileError("");
    return file;
  };

  const chooseResume = (file: File | undefined) => {
    const validFile = validateResume(file);
    if (validFile) {
      setResume(validFile);
      setFieldErrors((current) => ({ ...current, resume: undefined }));
    }
  };

  const onResumeDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    chooseResume(event.dataTransfer.files[0]);
  };

  const addAttachments = (files: FileList | null) => {
    if (!files?.length) return;
    const supported = ["pdf", "doc", "docx", "jpg", "jpeg", "png"];
    const nextFiles: File[] = [];
    for (const file of Array.from(files)) {
      const extension = file.name.split(".").pop()?.toLowerCase();
      if (!extension || !supported.includes(extension)) {
        setFileError("Supporting files must be PDF, DOC, DOCX, JPG, or PNG.");
        return;
      }
      if (file.size === 0) {
        setFileError(`${file.name} is empty.`);
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setFileError(`${file.name} is larger than 10 MB.`);
        return;
      }
      // Skip files that are already attached (same name and size).
      const isDuplicate =
        attachments.some(
          (existing) =>
            existing.name === file.name && existing.size === file.size,
        ) ||
        nextFiles.some(
          (existing) =>
            existing.name === file.name && existing.size === file.size,
        );
      if (!isDuplicate) nextFiles.push(file);
    }
    if (attachments.length + nextFiles.length > 5) {
      setFileError("You can attach up to five supporting files.");
      return;
    }
    setFileError("");
    setAttachments((current) => [...current, ...nextFiles]);
  };

  const submitApplication = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return; // blocks double submits (for example pressing Enter twice)
    if (currentStep < lastStep) {
      goToNextStep();
      return;
    }

    setSubmitError("");
    setSubmitted(false);
    setSuccessReference("");
    setNotificationsPending(false);

    if (!validateAll()) return;
    if (!resume) return; // validateAll already reported this; it narrows the type

    const year = Number(form.graduationYear.trim());

    const key = submissionKey || createSubmissionKey();
    setSubmissionKey(key);
    setSubmitting(true);

    // Send trimmed values. Optional URLs get a scheme if they were left out, the
    // email is lower-cased, and the phone number goes out in international format.
    const cleaned = Object.fromEntries(
      Object.entries(form).map(([field, value]) => [
        field,
        typeof value === "string" ? value.trim() : value,
      ]),
    ) as ApplicationForm;
    const phoneCheck = checkPhone(cleaned.phone);
    const application = {
      ...cleaned,
      email: cleaned.email.toLowerCase(),
      phone: phoneCheck.valid ? phoneCheck.normalized : cleaned.phone,
      positionId: cleaned.positionId || null,
      graduationYear: year,
      portfolioUrl: normalizeUrl(cleaned.portfolioUrl),
      linkedinUrl: normalizeUrl(cleaned.linkedinUrl),
    };

    const payload = new FormData();
    payload.append("application", JSON.stringify(application));
    payload.append("idempotency_key", key);
    payload.append("resume", resume);
    attachments.forEach((file) => payload.append("attachments[]", file));

    try {
      const response = await fetch("/api/careers/applications", {
        method: "POST",
        body: payload,
      });
      const result = await readJson(response);
      if (!response.ok) {
        // The data was rejected, so the retry must not reuse this idempotency key.
        if (response.status === 400 || response.status === 422) {
          setSubmissionKey("");
        }
        if (result.errors) {
          const serverErrors: ApplicationFieldErrors = {};
          for (const [errorKey, messages] of Object.entries(result.errors)) {
            const field = errorKey.startsWith("application.")
              ? errorKey.slice("application.".length)
              : errorKey;
            const message = Array.isArray(messages) ? messages[0] : undefined;
            if (field === "resume" || field === "attachments") {
              setFileError(message || "Check the uploaded files.");
            } else if (field in initialForm) {
              serverErrors[field as keyof ApplicationForm] =
                message || "Check this value.";
            }
          }
          setFieldErrors((current) => ({ ...current, ...serverErrors }));

          // Show the earliest step that the server flagged.
          const errorStep = APPLICATION_STEPS.findIndex((_, step) =>
            APPLICATION_STEP_FIELDS[step].some((field) => serverErrors[field]),
          );
          if (errorStep !== -1) {
            const firstField = APPLICATION_STEP_FIELDS[errorStep].find(
              (field) => serverErrors[field],
            );
            if (errorStep === currentStep) {
              if (firstField) focusField(firstField);
            } else {
              pendingFocusRef.current = firstField ?? null;
              setCurrentStep(errorStep);
            }
          }
        }
        const validationMessage = result.errors
          ? Object.values(result.errors).flat().find(Boolean)
          : undefined;
        throw new Error(
          validationMessage ||
            result.message ||
            "Your application could not be submitted.",
        );
      }
      setSubmitted(true);
      setSuccessReference(result.reference || "");
      setNotificationsPending(result.notifications_pending === true);
      setForm(initialForm);
      setResume(null);
      setAttachments([]);
      setFieldErrors({});
      setSubmissionKey("");
      setFileError("");
      if (resumeInputRef.current) resumeInputRef.current.value = "";
      if (attachmentInputRef.current) attachmentInputRef.current.value = "";
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Your application could not be submitted. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const sectionMotion = prefersReducedMotion
    ? {}
    : {
        initial: { opacity: 0, y: 20 },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, amount: 0.15 },
        transition: { duration: 0.55 },
      };

  return (
    <div className="overflow-hidden bg-white text-slate-900">
      <div className="relative isolate overflow-hidden bg-[#070d1f] text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[44rem]"
          style={GRID_BG}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -left-40 top-20 h-96 w-96 rounded-full bg-[#38bdf8]/15 blur-[120px]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-40 top-[40rem] h-96 w-96 rounded-full bg-[#f5a623]/10 blur-[120px]"
        />

        <div className="pointer-events-none absolute -right-36 -top-32 h-[28rem] w-[28rem] rounded-full bg-amber-400/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-48 left-1/4 h-96 w-96 rounded-full bg-sky-400/10 blur-3xl" />
        <div className="mx-auto flex max-w-7xl items-center justify-center border-b border-accent px-5 pb-10 pt-28 sm:px-8 lg:px-12">
          <motion.div
            {...sectionMotion}
            className="flex w-full max-w-5xl flex-col items-center text-center"
          >
            <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-accent">
              <Sparkles size={15} aria-hidden="true" />
              Careers at Infinitech
            </span>

            <h1 className="px-14 text-4xl font-bold tracking-tight sm:whitespace-nowrap sm:text-4xl md:px-12 lg:text-6xl">
              Build Your Future{" "}
              <span className="text-accent">With Infinitech.</span>
            </h1>

            <p className="mt-6 max-w-3xl text-base leading-8 text-slate-200 sm:text-sm md:text-lg">
              Be part of a team that transforms ideas into digital solutions.
              Explore opportunities to grow your skills, showcase your talents,
              and make an impact through technology, creativity, and innovation.
            </p>

            <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-4 text-sm text-slate-300">
              <span className="inline-flex items-center gap-2">
                <MapPin
                  size={16}
                  className="text-accent"
                  aria-hidden="true"
                />
                Makati, Philippines
              </span>

              <span className="inline-flex items-center gap-2">
                <UsersRound
                  size={16}
                  className="text-accent"
                  aria-hidden="true"
                />
                Creative minds, shared purpose
              </span>
            </div>
          </motion.div>
        </div>

        {/* Job Listing */}
        <section id="open-positions" className="scroll-mt-20 px-5 py-6 sm:px-8">
          <div className="mx-auto max-w-7xl">
            <motion.div
              {...sectionMotion}
              className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
            >
              <div>
                <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                  Find your next opportunity.
                </h2>
              </div>
              {!jobsLoading && !jobsError && (
                <span className="inline-flex w-fit items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-600">
                  <BriefcaseBusiness size={16} aria-hidden="true" />
                  {jobs.length} {jobs.length === 1 ? "open role" : "open roles"}
                </span>
              )}
            </motion.div>

            {jobsLoading ? (
              <div className="flex items-center justify-center gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-12 text-slate-600">
                <LoaderCircle
                  className="animate-spin text-amber-600"
                  size={22}
                  aria-hidden="true"
                />
                Loading current opportunities…
              </div>
            ) : jobsError ? (
              <div
                role="alert"
                className="rounded-3xl border border-rose-200 bg-rose-50 p-8 text-rose-800"
              >
                <p className="font-semibold">
                  We couldn&apos;t load current openings.
                </p>
                <p className="mt-2 text-sm">{jobsError}</p>
              </div>
            ) : jobs.length === 0 ? (
              <motion.div
                {...sectionMotion}
                className="rounded-3xl border border-slate-200 bg-[#f8f9fc] px-6 py-10 text-center sm:px-12"
              >
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-amber-100 text-amber-700">
                  <Sparkles size={25} aria-hidden="true" />
                </span>
                <h3 className="mt-5 text-xl font-bold text-[#0f1a3d]">
                  No active vacancies right now
                </h3>
                <p className="mx-auto mt-3 max-w-2xl leading-7 text-slate-600">
                  We&apos;re always looking for passionate and talented
                  individuals. Submit your application and let us know how you
                  can contribute to Infinitech.
                </p>
                <button
                  type="button"
                  onClick={() => applyFor()}
                  className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#0f1a3d] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#1b2b58] focus:outline-none focus:ring-4 focus:ring-blue-200"
                >
                  Send a general application{" "}
                  <ArrowRight size={17} aria-hidden="true" />
                </button>
              </motion.div>
            ) : (
              <div className="grid gap-5 lg:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.5fr)] lg:items-start">
                <div aria-label="Available positions" className="space-y-3">
                  {jobs.map((job, index) => {
                    const isSelected = job.id === selectedJobId;
                    return (
                      <motion.button
                        key={job.id}
                        type="button"
                        {...sectionMotion}
                        transition={{
                          duration: 0.35,
                          delay: prefersReducedMotion ? 0 : index * 0.04,
                        }}
                        aria-pressed={isSelected}
                        onClick={() => setSelectedJobId(job.id)}
                        className={`group flex min-h-28 w-full items-center justify-between gap-4 rounded-2xl border p-5 text-left shadow-sm transition focus:outline-none focus:ring-4 focus:ring-amber-500/20 ${
                          isSelected
                            ? "border-amber-500 bg-amber-50/60"
                            : "border-slate-200 bg-white hover:border-amber-300 hover:bg-slate-50"
                        }`}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-lg font-bold text-[#0f1a3d]">
                            {job.title}
                          </span>
                          <span className="mt-1 block truncate text-sm text-slate-600">
                            {job.department}
                          </span>
                          <span className="mt-3 flex flex-wrap gap-2">
                            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-600">
                              {job.employment_type}
                            </span>
                          </span>
                        </span>
                        <ArrowRight
                          size={19}
                          className={`shrink-0 transition-transform ${
                            isSelected
                              ? "translate-x-0.5 text-amber-700"
                              : "text-slate-400 group-hover:translate-x-0.5"
                          }`}
                          aria-hidden="true"
                        />
                      </motion.button>
                    );
                  })}
                </div>

                {jobs.map((job) =>
                  job.id === selectedJobId ? (
                    <motion.article
                      key={job.id}
                      {...sectionMotion}
                      aria-labelledby={`job-details-${job.id}`}
                      className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8 lg:sticky lg:top-24"
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-amber-700">
                            {job.department}
                          </p>
                          <h3
                            id={`job-details-${job.id}`}
                            className="mt-2 text-2xl font-bold text-[#0f1a3d] sm:text-3xl"
                          >
                            {job.title}
                          </h3>
                        </div>
                        <span className="inline-flex w-fit items-center gap-2 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800">
                          <Clock3 size={14} aria-hidden="true" />
                          {job.employment_type}
                        </span>
                      </div>
                      <p className="mt-6 leading-7 text-slate-600">
                        {job.description}
                      </p>
                      {job.qualifications?.length > 0 && (
                        <div className="mt-7">
                          <p className="text-lg font-bold text-slate-800">
                            About You
                          </p>
                          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                            {job.qualifications.map((qualification) => (
                              <li
                                key={qualification}
                                className="flex items-start gap-2 text-sm leading-6 text-slate-600"
                              >
                                <Check
                                  size={16}
                                  className="mt-1 shrink-0 text-amber-600"
                                  aria-hidden="true"
                                />
                                {qualification}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => applyFor(job)}
                        className="mt-8 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#0f1a3d] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#1b2b58] focus:outline-none focus:ring-4 focus:ring-blue-200"
                      >
                        Apply for this role{" "}
                        <ArrowRight size={17} aria-hidden="true" />
                      </button>
                    </motion.article>
                  ) : null,
                )}
              </div>
            )}
          </div>
        </section>

        {/* Application Form */}
        <section
          id="application-form"
          className="scroll-mt-16 bg-[#f8f9fc] px-5 py-20 sm:px-8 sm:py-24 lg:px-12"
        >
          <div className="mx-auto max-w-7xl">
            <motion.div
              {...sectionMotion}
              className="mx-auto mb-10 max-w-3xl text-center"
            >
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-amber-700">
                Your next step
              </p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#0f1a3d] sm:text-4xl">
                Let&apos;s get to know you.
              </h2>
              <p className="mt-4 leading-7 text-slate-600">
                Complete the form below and share what you could bring to the
                team.
              </p>
            </motion.div>

            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
              <form
                onSubmit={submitApplication}
                noValidate
                className="space-y-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8 lg:p-10"
                aria-label="Infinitech career application"
              >
                {submitted && (
                  <div
                    ref={successRef}
                    tabIndex={-1}
                    role="status"
                    aria-live="polite"
                    className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-900 outline-none"
                  >
                    <p className="flex items-center gap-2 font-bold">
                      <Check size={18} aria-hidden="true" />
                      Application submitted successfully
                    </p>
                    <p className="mt-2 text-sm leading-6">
                      Thank you for your interest in joining Infinitech! Your
                      application has been successfully submitted. Our
                      recruitment team will review your application and contact
                      you if your qualifications match our requirements.
                    </p>
                    {notificationsPending && (
                      <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                        Your application is saved, but the recruitment team
                        notification is pending. Please keep your reference;
                        there is no need to submit again.
                      </p>
                    )}
                  </div>
                )}
                {submitError && (
                  <div
                    role="alert"
                    className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
                  >
                    {submitError}
                  </div>
                )}

                {submitted ? (
                  <button
                    type="button"
                    onClick={startAnotherApplication}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#0f1a3d] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#1b2b58] focus:outline-none focus:ring-4 focus:ring-blue-200"
                  >
                    Start another application{" "}
                    <ArrowRight size={17} aria-hidden="true" />
                  </button>
                ) : (
                  <>
                    <div
                      aria-label={`Application progress: step ${currentStep + 1} of ${APPLICATION_STEPS.length}`}
                      className="space-y-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p
                            ref={stepHeadingRef}
                            tabIndex={-1}
                            aria-live="polite"
                            className="text-sm font-bold text-[#0f1a3d] outline-none"
                          >
                            Step {currentStep + 1} of {APPLICATION_STEPS.length}
                          </p>
                        </div>
                        <span className="text-sm font-semibold text-slate-500">
                          {Math.round(
                            ((currentStep + 1) / APPLICATION_STEPS.length) *
                              100,
                          )}
                          %
                        </span>
                      </div>
                      <ol className="grid grid-cols-5 gap-2">
                        {APPLICATION_STEPS.map((step, index) => (
                          <li
                            key={step.title}
                            aria-current={
                              currentStep === index ? "step" : undefined
                            }
                            className="min-w-0"
                          >
                            <div
                              className={`h-1.5 rounded-full transition-colors ${
                                index <= currentStep
                                  ? "bg-amber-400"
                                  : "bg-slate-200"
                              }`}
                            />
                            <span
                              className={`mt-2 hidden text-xs font-medium sm:block ${
                                index === currentStep
                                  ? "text-[#0f1a3d]"
                                  : "text-slate-400"
                              }`}
                            >
                              {step.title}
                            </span>
                          </li>
                        ))}
                      </ol>
                    </div>

                    {currentStep === 0 && (
                      <fieldset className="space-y-5">
                        <legend className="mb-1 flex items-center gap-3 text-lg font-bold text-[#0f1a3d]">
                          <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-100 text-amber-700">
                            <UsersRound size={18} aria-hidden="true" />
                          </span>
                          Personal information
                        </legend>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <CareerField
                            label="Full name"
                            name="fullName"
                            value={form.fullName}
                            onChange={updateForm}
                            error={fieldErrors.fullName}
                            required
                            maxLength={255}
                            autoComplete="name"
                            placeholder="Your full name"
                          />
                          <CareerField
                            label="Email address"
                            name="email"
                            value={form.email}
                            onChange={updateForm}
                            error={fieldErrors.email}
                            type="email"
                            required
                            maxLength={255}
                            autoComplete="email"
                            placeholder="you@example.com"
                          />
                          <CareerField
                            label="Contact number"
                            name="phone"
                            value={form.phone}
                            onChange={updateForm}
                            error={fieldErrors.phone}
                            hint="Philippine mobile or landline, or an international number starting with + and the country code."
                            type="tel"
                            required
                            maxLength={30}
                            autoComplete="tel"
                            placeholder="+63 9XX XXX XXXX"
                          />
                          <CareerField
                            label="City / Province"
                            name="cityProvince"
                            value={form.cityProvince}
                            onChange={updateForm}
                            error={fieldErrors.cityProvince}
                            required
                            maxLength={160}
                            autoComplete="address-level2"
                            placeholder="City, Province"
                          />
                          <div className="sm:col-span-2">
                            <CareerField
                              label="Current address"
                              name="address"
                              value={form.address}
                              onChange={updateForm}
                              error={fieldErrors.address}
                              required
                              maxLength={1000}
                              autoComplete="street-address"
                              placeholder="Street, barangay, city"
                            />
                          </div>
                        </div>
                      </fieldset>
                    )}

                    {currentStep === 1 && (
                      <fieldset className="space-y-5">
                        <legend className="mb-1 flex items-center gap-3 text-lg font-bold text-[#0f1a3d]">
                          <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-100 text-amber-700">
                            <BriefcaseBusiness size={18} aria-hidden="true" />
                          </span>
                          Application details
                        </legend>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <label className={labelClass}>
                            Position applying for
                            <select
                              className={`${inputClass} ${fieldErrors.positionId ? "border-rose-500" : ""}`}
                              name="positionId"
                              value={form.positionId}
                              onChange={updateForm}
                              aria-invalid={Boolean(fieldErrors.positionId)}
                              aria-describedby={
                                fieldErrors.positionId
                                  ? "positionId-error"
                                  : undefined
                              }
                            >
                              <option value="">Select Position</option>
                              {jobs.map((job) => (
                                <option key={job.id} value={job.id}>
                                  {job.title}
                                </option>
                              ))}
                            </select>
                            {fieldErrors.positionId && (
                              <span
                                id="positionId-error"
                                role="alert"
                                className="mt-1 block text-xs font-medium text-rose-700"
                              >
                                {fieldErrors.positionId}
                              </span>
                            )}
                          </label>
                          <CareerSelect
                            label="Employment type"
                            name="employmentType"
                            value={form.employmentType}
                            onChange={updateForm}
                            options={EMPLOYMENT_TYPES}
                            error={fieldErrors.employmentType}
                            required
                          />
                          <CareerField
                            label="Expected salary (optional)"
                            name="expectedSalary"
                            value={form.expectedSalary}
                            onChange={updateForm}
                            error={fieldErrors.expectedSalary}
                            maxLength={100}
                            placeholder="e.g. ₱20,000 monthly or negotiable"
                          />
                        </div>
                      </fieldset>
                    )}

                    {currentStep === 2 && (
                      <fieldset className="space-y-5">
                        <legend className="mb-1 flex items-center gap-3 text-lg font-bold text-[#0f1a3d]">
                          <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-100 text-amber-700">
                            <GraduationCap size={19} aria-hidden="true" />
                          </span>
                          Educational background
                        </legend>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <CareerSelect
                            label="Highest educational attainment"
                            name="education"
                            value={form.education}
                            onChange={updateForm}
                            options={EDUCATION_LEVELS}
                            error={fieldErrors.education}
                            required
                          />
                          <CareerField
                            label="School / University"
                            name="school"
                            value={form.school}
                            onChange={updateForm}
                            error={fieldErrors.school}
                            required
                            maxLength={255}
                            placeholder="School name"
                          />
                          <CareerField
                            label="Course / Degree"
                            name="course"
                            value={form.course}
                            onChange={updateForm}
                            error={fieldErrors.course}
                            required
                            maxLength={255}
                            placeholder="Course or degree"
                          />
                          <CareerField
                            label="Year graduated"
                            name="graduationYear"
                            value={form.graduationYear}
                            onChange={updateForm}
                            error={fieldErrors.graduationYear}
                            type="number"
                            min={MIN_GRADUATION_YEAR}
                            max={maxGraduationYear}
                            required
                            placeholder="2024"
                          />
                        </div>
                      </fieldset>
                    )}

                    {currentStep === 3 && (
                      <fieldset className="space-y-5">
                        <legend className="mb-1 flex items-center gap-3 text-lg font-bold text-[#0f1a3d]">
                          <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-100 text-amber-700">
                            <Target size={18} aria-hidden="true" />
                          </span>
                          Professional background
                        </legend>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <CareerSelect
                            label="Employment status"
                            name="employmentStatus"
                            value={form.employmentStatus}
                            onChange={updateForm}
                            options={EMPLOYMENT_STATUSES}
                            error={fieldErrors.employmentStatus}
                            required
                          />
                          {form.employmentStatus === "Unemployed" && (
                            <div className="sm:col-span-2">
                              <CareerTextarea
                                label="Reason for unemployment"
                                name="unemploymentReason"
                                value={form.unemploymentReason}
                                onChange={updateForm}
                                error={fieldErrors.unemploymentReason}
                                maxLength={2000}
                                required
                                placeholder="Briefly explain your current employment situation."
                              />
                            </div>
                          )}
                          <CareerSelect
                            label="Years of experience"
                            name="yearsExperience"
                            value={form.yearsExperience}
                            onChange={updateForm}
                            options={EXPERIENCE_LEVELS}
                            error={fieldErrors.yearsExperience}
                            required
                          />
                          <CareerField
                            label="Previous company (optional)"
                            name="previousCompany"
                            value={form.previousCompany}
                            onChange={updateForm}
                            error={fieldErrors.previousCompany}
                            maxLength={255}
                            placeholder="Company name"
                          />
                          <CareerField
                            label="Relevant skills"
                            name="skills"
                            value={form.skills}
                            onChange={updateForm}
                            error={fieldErrors.skills}
                            required
                            maxLength={2000}
                            placeholder="e.g. React, project management, design"
                          />
                          <div className="sm:col-span-2">
                            <CareerTextarea
                              label="Brief introduction — tell us about yourself"
                              name="introduction"
                              value={form.introduction}
                              onChange={updateForm}
                              error={fieldErrors.introduction}
                              maxLength={5000}
                              required
                              placeholder="Share a little about your background and what you enjoy doing."
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <CareerTextarea
                              label="Why do you want to join Infinitech?"
                              name="whyInfinitech"
                              value={form.whyInfinitech}
                              onChange={updateForm}
                              error={fieldErrors.whyInfinitech}
                              maxLength={5000}
                              required
                              placeholder="What interests you about working with our team?"
                            />
                          </div>
                        </div>
                      </fieldset>
                    )}

                    {currentStep === 4 && (
                      <>
                        <fieldset className="space-y-5">
                          <legend className="mb-1 flex items-center gap-3 text-lg font-bold text-[#0f1a3d]">
                            <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-100 text-amber-700">
                              <FileText size={18} aria-hidden="true" />
                            </span>
                            Resume and portfolio
                          </legend>
                          <div>
                            <span className={labelClass}>
                              Resume <span className="text-amber-600">*</span>
                            </span>
                            <div
                              onDragOver={(event) => event.preventDefault()}
                              onDrop={onResumeDrop}
                              className="mt-2 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-5 py-7 text-center transition hover:border-amber-400 hover:bg-amber-50/40"
                            >
                              <input
                                ref={resumeInputRef}
                                className="sr-only"
                                id="resume-upload"
                                name="resume"
                                type="file"
                                accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                                onChange={(event) => {
                                  chooseResume(event.target.files?.[0]);
                                  event.target.value = "";
                                }}
                                aria-invalid={Boolean(fieldErrors.resume)}
                                aria-describedby={
                                  fieldErrors.resume
                                    ? "resume-help resume-error"
                                    : "resume-help"
                                }
                              />
                              <UploadCloud
                                size={28}
                                className="mx-auto text-amber-600"
                                aria-hidden="true"
                              />
                              <p className="mt-3 text-sm font-semibold text-slate-800">
                                Drag and drop your resume here, or{" "}
                                <button
                                  type="button"
                                  onClick={() =>
                                    resumeInputRef.current?.click()
                                  }
                                  className="text-amber-700 underline decoration-amber-400 underline-offset-2 hover:text-amber-900"
                                >
                                  browse files
                                </button>
                              </p>
                              <p
                                id="resume-help"
                                className="mt-1 text-xs text-slate-500"
                              >
                                PDF, DOC, or DOCX · 10 MB maximum
                              </p>
                              {fieldErrors.resume && (
                                <p
                                  id="resume-error"
                                  role="alert"
                                  className="mt-2 text-sm font-medium text-rose-700"
                                >
                                  {fieldErrors.resume}
                                </p>
                              )}
                              {resume && (
                                <div className="mx-auto mt-4 flex max-w-md items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left">
                                  <span className="flex min-w-0 items-center gap-2 text-sm text-slate-700">
                                    <FileText
                                      size={17}
                                      className="shrink-0 text-amber-600"
                                      aria-hidden="true"
                                    />
                                    <span className="truncate">
                                      {resume.name}
                                    </span>
                                  </span>
                                  <span className="flex shrink-0 gap-1">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        resumeInputRef.current?.click()
                                      }
                                      className="rounded-lg px-2 py-1 text-xs font-semibold text-blue-800 hover:bg-blue-50"
                                      aria-label="Replace resume"
                                    >
                                      Replace
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setResume(null)}
                                      className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 hover:text-rose-700"
                                      aria-label="Remove resume"
                                    >
                                      <X size={17} />
                                    </button>
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="grid gap-4 sm:grid-cols-2">
                            <CareerField
                              label="Portfolio or personal website (optional)"
                              name="portfolioUrl"
                              value={form.portfolioUrl}
                              onChange={updateForm}
                              error={fieldErrors.portfolioUrl}
                              type="url"
                              maxLength={2048}
                              placeholder="https://"
                            />
                            <CareerField
                              label="LinkedIn profile (optional)"
                              name="linkedinUrl"
                              value={form.linkedinUrl}
                              onChange={updateForm}
                              error={fieldErrors.linkedinUrl}
                              type="url"
                              maxLength={2048}
                              placeholder="https://linkedin.com/in/your-name"
                            />
                          </div>
                          <div>
                            <span className={labelClass}>
                              Additional supporting documents (optional)
                            </span>
                            <input
                              ref={attachmentInputRef}
                              className="sr-only"
                              id="attachments-upload"
                              type="file"
                              multiple
                              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                              onChange={(event) => {
                                addAttachments(event.target.files);
                                event.target.value = "";
                              }}
                            />
                            <button
                              type="button"
                              onClick={() =>
                                attachmentInputRef.current?.click()
                              }
                              className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-amber-400 hover:bg-amber-50 focus:outline-none focus:ring-4 focus:ring-amber-100"
                            >
                              <UploadCloud size={17} aria-hidden="true" /> Add
                              files
                            </button>
                            <span className="ml-3 text-xs text-slate-500">
                              Up to 5 files · 10 MB each
                            </span>
                            {attachments.length > 0 && (
                              <ul className="mt-3 space-y-2">
                                {attachments.map((file, index) => (
                                  <li
                                    key={`${file.name}-${index}`}
                                    className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm"
                                  >
                                    <span className="truncate text-slate-700">
                                      {file.name}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setAttachments((current) =>
                                          current.filter(
                                            (_, fileIndex) =>
                                              fileIndex !== index,
                                          ),
                                        )
                                      }
                                      className="ml-3 rounded p-1 text-slate-500 hover:bg-white hover:text-rose-700"
                                      aria-label={`Remove ${file.name}`}
                                    >
                                      <X size={16} />
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                          {fileError && (
                            <p
                              role="alert"
                              className="text-sm font-medium text-rose-700"
                            >
                              {fileError}
                            </p>
                          )}
                        </fieldset>
                        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <input
                            className="mt-1 h-4 w-4 shrink-0 accent-amber-600"
                            type="checkbox"
                            name="consent"
                            checked={form.consent}
                            onChange={(event) => {
                              setForm((current) => ({
                                ...current,
                                consent: event.target.checked,
                              }));
                              setFieldErrors((current) => {
                                const next = { ...current };
                                delete next.consent;
                                return next;
                              });
                            }}
                            required
                            aria-invalid={Boolean(fieldErrors.consent)}
                            aria-describedby={
                              fieldErrors.consent ? "consent-error" : undefined
                            }
                          />
                          <span className="text-sm leading-6 text-slate-700">
                            I confirm that the information provided is accurate
                            and authorize Infinitech Advertising Corporation to
                            process my personal information for recruitment and
                            employment-related purposes. I have read and agree
                            to the{" "}
                            <Link
                              href="/privacy-policy"
                              target="_blank"
                              className="font-semibold text-blue-800 underline underline-offset-2 hover:text-blue-950"
                            >
                              Privacy Policy
                            </Link>
                            .
                          </span>
                        </label>
                        {fieldErrors.consent && (
                          <p
                            id="consent-error"
                            role="alert"
                            className="mt-2 text-sm font-medium text-rose-700"
                          >
                            {fieldErrors.consent}
                          </p>
                        )}
                      </>
                    )}
                    <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
                      <button
                        type="button"
                        disabled={currentStep === 0 || submitting}
                        onClick={() =>
                          setCurrentStep((step) => Math.max(step - 1, 0))
                        }
                        className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Back
                      </button>
                      {currentStep < lastStep ? (
                        <button
                          type="button"
                          onClick={goToNextStep}
                          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-amber-400 px-5 py-3 text-sm font-bold text-[#13203e] transition hover:bg-amber-300 focus:outline-none focus:ring-4 focus:ring-amber-200"
                        >
                          Continue <ArrowRight size={17} aria-hidden="true" />
                        </button>
                      ) : (
                        <button
                          type="submit"
                          disabled={submitting}
                          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-amber-400 px-5 py-3 text-sm font-bold text-[#13203e] transition hover:bg-amber-300 focus:outline-none focus:ring-4 focus:ring-amber-200 disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          {submitting ? (
                            <>
                              <LoaderCircle
                                size={18}
                                className="animate-spin"
                                aria-hidden="true"
                              />
                              Submitting…
                            </>
                          ) : (
                            <>
                              Submit application{" "}
                              <ArrowRight size={17} aria-hidden="true" />
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </>
                )}
              </form>

              <aside className="space-y-5 lg:sticky lg:top-24">
                <div className="rounded-3xl bg-[#0f1a3d] p-6 text-white sm:p-7">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-400 text-[#13203e]">
                    <Sparkles size={22} aria-hidden="true" />
                  </span>
                  <h3 className="mt-5 text-xl font-bold">A little about us</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-300">
                    Infinitech brings technology, creativity, and strategy
                    together to help businesses grow. We&apos;re always glad to
                    meet people excited to make useful, thoughtful work.
                  </p>
                  <div className="mt-6 space-y-3 border-t border-white/15 pt-5 text-sm text-slate-200">
                    <p className="flex items-center gap-2">
                      <MapPin
                        size={16}
                        className="text-amber-300"
                        aria-hidden="true"
                      />
                      Makati City, Philippines
                    </p>
                    <p className="flex items-center gap-2">
                      <BriefcaseBusiness
                        size={16}
                        className="text-amber-300"
                        aria-hidden="true"
                      />
                      Open to different career paths
                    </p>
                  </div>
                </div>
                <div className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-7">
                  <h3 className="font-bold text-[#0f1a3d]">Before you apply</h3>
                  <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
                    <li className="flex gap-2">
                      <Check
                        size={17}
                        className="mt-0.5 shrink-0 text-amber-600"
                        aria-hidden="true"
                      />
                      Share an up-to-date resume in PDF, DOC, or DOCX format.
                    </li>
                    <li className="flex gap-2">
                      <Check
                        size={17}
                        className="mt-0.5 shrink-0 text-amber-600"
                        aria-hidden="true"
                      />
                      Add a portfolio or supporting work if you have one.
                    </li>
                    <li className="flex gap-2">
                      <Check
                        size={17}
                        className="mt-0.5 shrink-0 text-amber-600"
                        aria-hidden="true"
                      />
                      Your information is used only for recruitment purposes.
                    </li>
                  </ul>
                </div>
              </aside>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}