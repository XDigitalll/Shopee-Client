import type { CustomerProfile, UserAddress } from "@/lib/types";

export function buildDisplayName(profile: CustomerProfile | null) {
  return profile?.displayName || profile?.name || "";
}

export function createPrefilledContact(profile: CustomerProfile | null) {
  const email = profile?.email?.trim() || "";
  const realEmail = email && !email.toLowerCase().endsWith("@xdigital.local") ? email : "";
  return {
    fullName: buildDisplayName(profile),
    primaryPhoneNumber: profile?.phoneNumber || "+258",
    alternativePhoneNumber: profile?.alternativePhoneNumber || "",
    email: realEmail,
  };
}

export function createPrefilledAddress(profile: CustomerProfile | null) {
  return {
    city: profile?.deliveryCity || profile?.city || "Maputo",
    neighborhood: profile?.deliveryNeighborhood || "",
    street: profile?.deliveryStreet || "",
    houseNumber: profile?.houseNumber || "",
    deliveryReference: profile?.deliveryReference || "",
    googleMapsLink: profile?.googleMapsLink || "",
  };
}

export function applySavedAddress<T extends {
  city: string;
  neighborhood: string;
  street: string;
  houseNumber: string;
  deliveryReference: string;
  googleMapsLink: string;
}>(form: T, address: UserAddress): T {
  return {
    ...form,
    city: address.city || form.city,
    neighborhood: address.neighborhood || "",
    street: address.street || "",
    houseNumber: address.houseNumber || "",
    deliveryReference: address.reference || "",
    googleMapsLink: address.googleMapsLink || "",
  };
}

export function addressMatchesForm(
  address: UserAddress,
  form: {
    city: string;
    neighborhood: string;
    street: string;
    houseNumber: string;
    deliveryReference: string;
    googleMapsLink: string;
  }
) {
  const normalize = (value?: string) => (value || "").trim().toLowerCase();
  return (
    normalize(address.city) === normalize(form.city) &&
    normalize(address.neighborhood) === normalize(form.neighborhood) &&
    normalize(address.street) === normalize(form.street) &&
    normalize(address.houseNumber) === normalize(form.houseNumber) &&
    normalize(address.reference) === normalize(form.deliveryReference) &&
    normalize(address.googleMapsLink) === normalize(form.googleMapsLink)
  );
}

export function createAddressLabel(form: {
  neighborhood: string;
  street: string;
  city: string;
}) {
  const parts = [form.neighborhood, form.street, form.city].map((value) => value.trim()).filter(Boolean);
  return parts[0] || "Minha morada";
}
