import { fireEvent, render, screen } from "@testing-library/react-native";
import { API_URL } from "@/lib/config";
import { FeedbackScreen } from "./FeedbackScreen";

const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; });

function fillForm() {
  render(<FeedbackScreen />);
  fireEvent.changeText(screen.getByLabelText("Name"), "Ada");
  fireEvent.changeText(screen.getByLabelText("Message"), "Dark mode please");
}

it("submits anonymously and clears the form after success", async () => {
  const fetch = jest.fn().mockResolvedValue({ ok: true });
  global.fetch = fetch;
  fillForm();
  fireEvent.press(screen.getByText("Submit"));
  expect(await screen.findByText("Thank you for your feedback!")).toBeTruthy();
  expect(fetch).toHaveBeenCalledWith(`${API_URL}/api/feedback/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Ada", message: "Dark mode please", rating: 5 }),
  });
  expect(screen.getByLabelText("Message").props.value).toBe("");
});

it("keeps the message available for retry after a failed request", async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false });
  fillForm();
  fireEvent.press(screen.getByText("Submit"));
  expect(await screen.findByText("Something went wrong. Please try again.")).toBeTruthy();
  expect(screen.getByLabelText("Message").props.value).toBe("Dark mode please");
  expect(screen.getByText("Submit")).toBeTruthy();
});
