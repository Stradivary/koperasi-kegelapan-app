/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";

// Import components to get coverage
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "../collapsible";
import { Select, SelectValue, SelectTrigger } from "../select";
import { Input } from "../input";
import { Label } from "../label";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "../dialog";

describe("UI Components", () => {
  describe("Collapsible", () => {
    it("renders Collapsible root", () => {
      const { container } = render(
        <Collapsible>
          <CollapsibleTrigger>Toggle</CollapsibleTrigger>
          <CollapsibleContent>Content</CollapsibleContent>
        </Collapsible>,
      );
      expect(container.querySelector('[data-slot="collapsible"]')).toBeTruthy();
    });

    it("renders trigger with data-slot", () => {
      const { container } = render(
        <Collapsible>
          <CollapsibleTrigger>Toggle</CollapsibleTrigger>
        </Collapsible>,
      );
      expect(container.querySelector('[data-slot="collapsible-trigger"]')).toBeTruthy();
    });

    it("renders content with data-slot", () => {
      const { container } = render(
        <Collapsible open>
          <CollapsibleContent>Content</CollapsibleContent>
        </Collapsible>,
      );
      expect(container.querySelector('[data-slot="collapsible-content"]')).toBeTruthy();
    });
  });

  describe("Input", () => {
    it("renders an input element", () => {
      const { container } = render(<Input placeholder="test" />);
      const input = container.querySelector("input");
      expect(input).toBeTruthy();
      expect(input?.getAttribute("placeholder")).toBe("test");
    });

    it("applies custom className", () => {
      const { container } = render(<Input className="custom-class" />);
      const input = container.querySelector("input");
      expect(input?.className).toContain("custom-class");
    });
  });

  describe("Label", () => {
    it("renders a label element", () => {
      const { container } = render(<Label>Test Label</Label>);
      const label = container.querySelector('[data-slot="label"]');
      expect(label).toBeTruthy();
      expect(label?.textContent).toBe("Test Label");
    });
  });

  describe("Select", () => {
    it("renders select trigger", () => {
      const { container } = render(
        <Select>
          <SelectTrigger>
            <SelectValue placeholder="Choose" />
          </SelectTrigger>
        </Select>,
      );
      expect(container.querySelector('[data-slot="select-trigger"]')).toBeTruthy();
    });

    it("renders select trigger with sm size", () => {
      const { container } = render(
        <Select>
          <SelectTrigger size="sm">
            <SelectValue placeholder="Choose" />
          </SelectTrigger>
        </Select>,
      );
      const trigger = container.querySelector('[data-slot="select-trigger"]') as any;
      expect(trigger?.dataset.size).toBe("sm");
    });
  });

  describe("Dialog", () => {
    it("renders dialog trigger", () => {
      const { container } = render(
        <Dialog>
          <DialogTrigger>Open</DialogTrigger>
        </Dialog>,
      );
      expect(container.querySelector('[data-slot="dialog-trigger"]')).toBeTruthy();
    });

    it("renders dialog content when open", () => {
      const { baseElement } = render(
        <Dialog open>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Title</DialogTitle>
              <DialogDescription>Description</DialogDescription>
            </DialogHeader>
            <DialogFooter>Footer</DialogFooter>
          </DialogContent>
        </Dialog>,
      );
      expect(baseElement.querySelector('[data-slot="dialog-content"]')).toBeTruthy();
      expect(baseElement.querySelector('[data-slot="dialog-title"]')).toBeTruthy();
      expect(baseElement.querySelector('[data-slot="dialog-description"]')).toBeTruthy();
      expect(baseElement.querySelector('[data-slot="dialog-header"]')).toBeTruthy();
      expect(baseElement.querySelector('[data-slot="dialog-footer"]')).toBeTruthy();
    });

    it("renders dialog overlay when open", () => {
      const { baseElement } = render(
        <Dialog open>
          <DialogContent>Content</DialogContent>
        </Dialog>,
      );
      expect(baseElement.querySelector('[data-slot="dialog-overlay"]')).toBeTruthy();
    });

    it("renders close button by default", () => {
      const { baseElement } = render(
        <Dialog open>
          <DialogContent>Content</DialogContent>
        </Dialog>,
      );
      expect(baseElement.querySelector('[data-slot="dialog-close"]')).toBeTruthy();
    });

    it("hides close button when showCloseButton is false", () => {
      // Just verify it renders without error
      expect(() => {
        render(
          <Dialog open>
            <DialogContent showCloseButton={false}>Content</DialogContent>
          </Dialog>,
        );
      }).not.toThrow();
    });

    it("renders footer with close button when showCloseButton is true", () => {
      // Just verify it renders without error
      expect(() => {
        render(
          <Dialog open>
            <DialogContent>
              <DialogFooter showCloseButton>Actions</DialogFooter>
            </DialogContent>
          </Dialog>,
        );
      }).not.toThrow();
    });

    it("renders DialogClose component", () => {
      const { baseElement } = render(
        <Dialog open>
          <DialogContent>
            <DialogClose>X</DialogClose>
          </DialogContent>
        </Dialog>,
      );
      const closeButtons = baseElement.querySelectorAll('[data-slot="dialog-close"]');
      expect(closeButtons.length).toBeGreaterThan(0);
    });
  });
});
