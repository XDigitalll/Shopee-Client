"use client";

import { useState } from "react";
import type { CSSProperties } from "react";

type GoogleMapsLocationFieldProps = {
  id?: string;
  label?: string;
  value: string;
  error?: string | null;
  hint?: string;
  inputClassName?: string;
  inputStyle?: CSSProperties;
  buttonClassName?: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
};

function locationLink(latitude: number, longitude: number) {
  return `https://www.google.com/maps/search/?api=1&query=${latitude.toFixed(6)},${longitude.toFixed(6)}`;
}

function getLocationErrorMessage() {
  return "N\u00E3o foi poss\u00EDvel obter localiza\u00E7\u00E3o. Pode continuar preenchendo manualmente.";
}

export function GoogleMapsLocationField({
  id,
  label = "Google Maps",
  value,
  error,
  hint = "Opcional. A morada manual e o principal; o link do Google Maps apenas ajuda a entrega.",
  inputClassName = "w-full rounded-2xl border px-4 py-3 text-sm outline-none",
  inputStyle,
  buttonClassName = "rounded-full border px-4 py-2 text-sm font-bold",
  onChange,
  onBlur,
}: GoogleMapsLocationFieldProps) {
  const [locating, setLocating] = useState(false);
  const [locationMessage, setLocationMessage] = useState("");

  function useCurrentLocation() {
    setLocationMessage("");
    if (!navigator.geolocation) {
      setLocationMessage(getLocationErrorMessage());
      return;
    }

    setLocating(true);

    const applyPosition = (position: GeolocationPosition) => {
      const { latitude, longitude } = position.coords;
      onChange(locationLink(latitude, longitude));
      onBlur?.();
      setLocationMessage("Localizacao atual adicionada.");
      setLocating(false);
    };

    const retryWithNormalAccuracy = (firstError: GeolocationPositionError) => {
      if (firstError.code === firstError.PERMISSION_DENIED) {
        setLocationMessage(getLocationErrorMessage());
        setLocating(false);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        applyPosition,
        (secondError) => {
          setLocationMessage(getLocationErrorMessage());
          setLocating(false);
        },
        { enableHighAccuracy: false, timeout: 30000, maximumAge: 300000 }
      );
    };

    navigator.geolocation.getCurrentPosition(
      applyPosition,
      retryWithNormalAccuracy,
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 300000 }
    );
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {label ? (
          <label className="text-sm font-semibold" htmlFor={id}>
            {label}
          </label>
        ) : <span />}
        <button
          type="button"
          onClick={useCurrentLocation}
          disabled={locating}
          className={`${buttonClassName} disabled:cursor-not-allowed disabled:opacity-60`}
          style={{ borderColor: "#EF3B18", color: "#EF3B18" }}
        >
          {locating ? "A obter..." : "\uD83D\uDCCD Usar localiza\u00E7\u00E3o atual (opcional)"}
        </button>
      </div>
      <input
        id={id}
        type="url"
        inputMode="url"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        className={inputClassName}
        style={inputStyle}
        placeholder="https://maps.google.com/..."
      />
      {hint ? <p className="text-xs" style={{ color: "#8B7B74" }}>{hint}</p> : null}
      {locationMessage ? <p className="text-xs font-medium" style={{ color: locationMessage.startsWith("Localizacao") ? "#137A3D" : "#0C4A6E" }}>{locationMessage}</p> : null}
      {error ? <p className="text-xs font-medium" style={{ color: "#B42318" }}>{error}</p> : null}
    </div>
  );
}
