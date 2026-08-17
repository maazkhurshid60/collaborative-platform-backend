import crypto from "crypto";

import prisma from "../db/db.config";
import { ApiError } from "../utils/apiError";
import { StatusCodes } from "http-status-codes";
import { Approve } from "../generated/prisma/enums";

const EDITABLE_FIELDS = [
    "professionalTitle",
    "credentials",
    "yearsOfExperience",
    "shortIntroduction",
    "aboutMe",
    "professionalPhilosophy",
    "whyIDoThisWork",
    "specialties",
    "conditionsTreated",
    "areasOfExpertise",
    "services",
    "clientFocus",
    "treatmentApproaches",
    "languages",
    "acceptingNewPatients",
    "allowQueries",
    "offersOnlineSessions",
    "offersInPersonSessions",
    "offersHomeVisits",
    "officeHours",
    "previousOrganizations",
    "clinicalExperience",
    "websiteUrl",
    "introVideoUrl",
    "socialLinks",
    "education",
    "licenses",
    "locations",
    "memberships",
    "awards",
    "clinicPhotos",
    "certificates",
    "consultationFee",
    "followUpFee",
    "slidingScale",
    "paymentMethods",
    "insuranceAccepted",
    "emergencyContactInstructions",
    "crisisResources",
    "consentFormUrl",
    "intakeFormUrl",
    "privacyPolicyUrl",
    "hipaaNoticeUrl",
    // NOTE: identityVerified / backgroundChecked are deliberately excluded here —
    // they're platform-controlled and only settable via setVerificationFlags (superAdmin only).
] as const;

// The subset of EDITABLE_FIELDS that counts toward the public-facing "profile
// completeness" score — the fields that most matter for a visitor deciding
// whether to reach out, not every niche/admin field a provider can fill in.
// A provider must clear COMPLETENESS_THRESHOLD_PERCENT before they're allowed
// to publish (see setPublished).
const COMPLETENESS_THRESHOLD_PERCENT = 50;

type CompletenessCheck = (profile: Record<string, any>) => boolean;

const COMPLETENESS_CHECKS: CompletenessCheck[] = [
    (p) => Boolean(p.professionalTitle?.trim()),
    (p) => Boolean(p.credentials?.trim()),
    (p) => typeof p.yearsOfExperience === "number" && p.yearsOfExperience > 0,
    (p) => Boolean(p.shortIntroduction?.trim()),
    (p) => Boolean(p.aboutMe?.trim()),
    (p) => Array.isArray(p.specialties) && p.specialties.length > 0,
    (p) => Array.isArray(p.services) && p.services.length > 0,
    (p) => Array.isArray(p.languages) && p.languages.length > 0,
    (p) => Boolean(p.offersOnlineSessions || p.offersInPersonSessions || p.offersHomeVisits),
    (p) => Boolean(p.officeHours?.trim()),
    (p) => p.consultationFee != null || p.followUpFee != null,
    (p) => Array.isArray(p.locations) && p.locations.length > 0,
];

function computeCompleteness(profile: Record<string, any> | null | undefined) {
    const total = COMPLETENESS_CHECKS.length;
    const filled = COMPLETENESS_CHECKS.reduce(
        (count, check) => count + (profile && check(profile) ? 1 : 0),
        0,
    );
    return {
        completenessPercent: Math.round((filled / total) * 100),
        completenessFilled: filled,
        completenessTotal: total,
    };
}

function slugify(input: string) {
    return input
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
}

function generateSlug(fullName: string) {
    const base = slugify(fullName) || "provider";
    return `${base}-${crypto.randomBytes(3).toString("hex")}`;
}

function pickEditableFields(data: Record<string, any>) {
    const result: Record<string, any> = {};
    for (const field of EDITABLE_FIELDS) {
        if (data[field] !== undefined) result[field] = data[field];
    }
    return result;
}

export class ProviderProfileService {
    async getOrCreateForLoginUser(loginUserId: string) {
        const provider = await prisma.provider.findUnique({
            where: { userId: loginUserId },
            include: { user: true, profile: true },
        });

        if (!provider) {
            throw new ApiError(StatusCodes.NOT_FOUND, "Provider not found");
        }

        if (provider.profile) return { ...provider.profile, ...computeCompleteness(provider.profile) };

        const created = await prisma.providerProfile.create({
            data: {
                providerId: provider.id,
                slug: generateSlug(provider.user.fullName),
            },
        });
        return { ...created, ...computeCompleteness(created) };
    }

    async updateForLoginUser(loginUserId: string, data: Record<string, any>) {
        const provider = await prisma.provider.findUnique({
            where: { userId: loginUserId },
            include: { user: true },
        });

        if (!provider) {
            throw new ApiError(StatusCodes.NOT_FOUND, "Provider not found");
        }

        const updated = await prisma.providerProfile.upsert({
            where: { providerId: provider.id },
            create: {
                providerId: provider.id,
                slug: generateSlug(provider.user.fullName),
                ...pickEditableFields(data),
            },
            update: pickEditableFields(data),
        });
        return { ...updated, ...computeCompleteness(updated) };
    }

    async setPublished(loginUserId: string, isPublished: boolean) {
        const provider = await prisma.provider.findUnique({
            where: { userId: loginUserId },
            include: { user: true, profile: true },
        });

        if (!provider) {
            throw new ApiError(StatusCodes.NOT_FOUND, "Provider not found");
        }

        if (isPublished) {
            const { completenessPercent } = computeCompleteness(provider.profile);
            if (completenessPercent < COMPLETENESS_THRESHOLD_PERCENT) {
                throw new ApiError(
                    StatusCodes.BAD_REQUEST,
                    `Your public profile is only ${completenessPercent}% complete. Fill in at least ${COMPLETENESS_THRESHOLD_PERCENT}% before publishing.`,
                );
            }

            // Publishing also requires the account itself to be admin-approved —
            // otherwise the profile would silently never appear anywhere public
            // (getPublicBySlug/searchPublished/booking all re-check this), leaving
            // the provider confused about why "Published" doesn't actually show up.
            if (provider.user.isApprove !== Approve.APPROVED) {
                throw new ApiError(
                    StatusCodes.BAD_REQUEST,
                    "Your account is still pending admin approval. Your profile can't go live until your account is approved — you can still finish setting it up in the meantime.",
                );
            }
        }

        const slug = provider.profile?.slug || generateSlug(provider.user.fullName);

        const updated = await prisma.providerProfile.upsert({
            where: { providerId: provider.id },
            create: { providerId: provider.id, slug, isPublished },
            update: { isPublished, slug },
        });
        return { ...updated, ...computeCompleteness(updated) };
    }

    // superAdmin only — sets platform-controlled verification flags for a provider,
    // identified by their Provider row id (not userId), matching the admin panel's usage.
    async setVerificationFlags(
        providerId: string,
        flags: { identityVerified?: boolean; backgroundChecked?: boolean },
    ) {
        const provider = await prisma.provider.findUnique({
            where: { id: providerId },
            include: { user: true },
        });

        if (!provider) {
            throw new ApiError(StatusCodes.NOT_FOUND, "Provider not found");
        }

        return prisma.providerProfile.upsert({
            where: { providerId: provider.id },
            create: {
                providerId: provider.id,
                slug: generateSlug(provider.user.fullName),
                ...flags,
            },
            update: flags,
        });
    }

    // Public — no auth. Small, curated result set (published + approved providers only),
    // so filtering in JS after one findMany is simpler and plenty fast at this scale;
    // revisit with DB-level filtering if the published-provider count grows large.
    async searchPublished(filters: { query?: string; specialty?: string }) {
        const profiles = await prisma.providerProfile.findMany({
            where: {
                isPublished: true,
                provider: { user: { isApprove: Approve.APPROVED } },
            },
            include: { provider: { include: { user: true } } },
            orderBy: { updatedAt: "desc" },
        });

        const query = filters.query?.trim().toLowerCase();
        const specialty = filters.specialty?.trim().toLowerCase();

        return profiles
            .map((profile) => {
                const { provider, ...profileFields } = profile;
                const { user } = provider;
                const locations = Array.isArray(profileFields.locations)
                    ? (profileFields.locations as Record<string, any>[])
                    : [];
                const primaryLocation = locations.find((l) => l?.isPrimary) || locations[0] || {};

                return {
                    slug: profileFields.slug,
                    fullName: user.fullName,
                    profileImage: user.profileImage,
                    professionalTitle: profileFields.professionalTitle,
                    credentials: profileFields.credentials,
                    yearsOfExperience: profileFields.yearsOfExperience,
                    specialties: profileFields.specialties,
                    city: primaryLocation.city || null,
                    state: primaryLocation.state || user.state || null,
                    country: primaryLocation.country || user.country || null,
                    // Always true here — searchPublished's where-clause already
                    // restricts results to admin-approved providers.
                    isVerified: true,
                };
            })
            .filter((result) => {
                if (query) {
                    const haystack = [result.fullName, result.city, result.state]
                        .filter(Boolean)
                        .join(" ")
                        .toLowerCase();
                    if (!haystack.includes(query)) return false;
                }
                if (specialty && !result.specialties.some((s) => s.toLowerCase().includes(specialty)))
                    return false;
                return true;
            });
    }

    async getPublicBySlug(slug: string) {
        const profile = await prisma.providerProfile.findUnique({
            where: { slug },
            include: {
                provider: { include: { user: true } },
            },
        });

        if (!profile || !profile.isPublished) return null;

        const { provider, ...profileFields } = profile;
        const { user } = provider;

        // Extra safety net: never surface a profile for a provider whose account
        // isn't admin-approved, even if they somehow flipped isPublished on.
        if (user.isApprove !== Approve.APPROVED) return null;

        return {
            ...profileFields,
            fullName: user.fullName,
            profileImage: user.profileImage,
            licenseNo: user.licenseNo,
            isVerified: user.isApprove === Approve.APPROVED,
            licenseVerified: user.isLicenseValid,
            state: user.state,
            country: user.country,
            contactNo: user.contactNo,
            email: user.email,
        };
    }
}
