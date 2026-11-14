import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError, type AxiosResponse } from "axios";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import { TOKEN_KEY } from "../services/session";
import Login from "./Login";

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("../services/api", () => ({ default: { post } }));

const session = {
  token: "jwt-123",
  user: { id: 1, name: "Ramesh", email: "typer@atc.in", role: "typer" },
};

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={["/login?logout=true"]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard" element={<p>Dashboard page</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Email Address"), "typer@atc.in");
  await user.type(screen.getByLabelText("Password"), "secret123");
  await user.click(screen.getByRole("button", { name: /sign in/i }));
}

describe("Login", () => {
  beforeEach(() => {
    post.mockReset();
  });

  it("renders the form, remember me toggle and role indicator", () => {
    renderLogin();
    expect(screen.getByLabelText("Email Address")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: /remember session/i }),
    ).not.toBeChecked();
    expect(screen.getByText("Field Typer Portal")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Typer Account" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Admin Account" }),
    ).toBeInTheDocument();
  });

  it("submits credentials and redirects to the dashboard", async () => {
    post.mockResolvedValue({ data: session });
    const user = userEvent.setup();
    renderLogin();

    await fillAndSubmit(user);

    expect(await screen.findByText("Dashboard page")).toBeInTheDocument();
    expect(post).toHaveBeenCalledWith("/auth/login", {
      email: "typer@atc.in",
      password: "secret123",
    });
  });

  it("persists the session in localStorage when remember me is on", async () => {
    post.mockResolvedValue({ data: session });
    const user = userEvent.setup();
    renderLogin();

    await user.click(
      screen.getByRole("checkbox", { name: /remember session/i }),
    );
    await fillAndSubmit(user);

    await screen.findByText("Dashboard page");
    expect(localStorage.getItem(TOKEN_KEY)).toBe("jwt-123");
  });

  it("shows an error alert for invalid credentials", async () => {
    post.mockRejectedValue(
      new AxiosError("Unauthorized", "ERR_BAD_REQUEST", undefined, undefined, {
        status: 401,
      } as AxiosResponse),
    );
    const user = userEvent.setup();
    renderLogin();

    await fillAndSubmit(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Invalid email or password",
    );
    expect(screen.queryByText("Dashboard page")).not.toBeInTheDocument();
  });

  it("shows a connection error when the server is unreachable", async () => {
    post.mockRejectedValue(new AxiosError("Network Error", "ERR_NETWORK"));
    const user = userEvent.setup();
    renderLogin();

    await fillAndSubmit(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to connect to authentication service",
    );
  });

  it("disables the button and shows a spinner label while signing in", async () => {
    post.mockReturnValue(new Promise(() => {})); // never resolves
    const user = userEvent.setup();
    renderLogin();

    await fillAndSubmit(user);

    expect(
      await screen.findByRole("button", { name: /authenticating/i }),
    ).toBeDisabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
