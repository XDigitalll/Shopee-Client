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
  return `https://www.google.com/maps?q=${latitude},${longitude}`;
}

export function GoogleMapsLocationField({
  id,
  label = "Google Maps",
  value,
  error,
  hint = "Opcional. Cola o link do Google Maps ou usa a localizacao atual.",
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
      setLocationMessage("O teu navegador nao permite obter a localizacao automaticamente.");
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        onChange(locationLink(latitude, longitude));
        setLocationMessage("Localizacao atual adicionada. Podes editar o link se quiseres.");
        setLocating(false);
      },
      () => {
        setLocationMessage("Nao foi possivel obter a localizacao. Cola o link manualmente se tiveres.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 12000 }
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
          {locating ? "A obter..." : "Usar localizacao atual"}
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
      {locationMessage ? <p className="text-xs font-medium" style={{ color: locationMessage.startsWith("Nao") ? "#B42318" : "#137A3D" }}>{locationMessage}</p> : null}
      {error ? <p className="text-xs font-medium" style={{ color: "#B42318" }}>{error}</p> : null}
    </div>
  );
}
