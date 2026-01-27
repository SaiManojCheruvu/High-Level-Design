// Operational Transformation utilities

export const applyOperation = (content, operation) => {
  if (!operation.applied) return content;

  let result = content;

  switch (operation.type) {
    case "INSERT":
      if (operation.position <= result.length) {
        result =
          result.slice(0, operation.position) +
          operation.text +
          result.slice(operation.position);
      } else {
        // If position is beyond current length, append
        result += operation.text;
      }
      break;

    case "DELETE":
      if (operation.position < result.length) {
        const endPos = Math.min(
          operation.position + operation.text.length,
          result.length,
        );
        result = result.slice(0, operation.position) + result.slice(endPos);
      }
      break;

    default:
      console.warn("Unknown operation type:", operation.type);
  }

  return result;
};

export const generateOperations = (oldContent, newContent) => {
  const operations = [];

  // Simple diff algorithm (for demo purposes)
  // In production, you'd want a more sophisticated diff algorithm

  if (newContent.length > oldContent.length) {
    // Likely insertion
    let i = 0;
    while (i < oldContent.length && oldContent[i] === newContent[i]) {
      i++;
    }

    if (i < newContent.length) {
      const insertedText = newContent.slice(
        i,
        newContent.length - (oldContent.length - i),
      );
      operations.push({
        type: "INSERT",
        position: i,
        text: insertedText,
      });
    }
  } else if (newContent.length < oldContent.length) {
    // Likely deletion
    let i = 0;
    while (i < newContent.length && oldContent[i] === newContent[i]) {
      i++;
    }

    if (i < oldContent.length) {
      const deletedText = oldContent.slice(
        i,
        i + (oldContent.length - newContent.length),
      );
      operations.push({
        type: "DELETE",
        position: i,
        text: deletedText,
      });
    }
  } else {
    // Same length, could be replacement
    // For simplicity, we'll treat as delete + insert
    let startDiff = -1;
    let endDiff = -1;

    for (let i = 0; i < oldContent.length; i++) {
      if (oldContent[i] !== newContent[i]) {
        if (startDiff === -1) startDiff = i;
        endDiff = i;
      }
    }

    if (startDiff !== -1) {
      const deletedText = oldContent.slice(startDiff, endDiff + 1);
      const insertedText = newContent.slice(startDiff, endDiff + 1);

      if (deletedText) {
        operations.push({
          type: "DELETE",
          position: startDiff,
          text: deletedText,
        });
      }

      if (insertedText) {
        operations.push({
          type: "INSERT",
          position: startDiff,
          text: insertedText,
        });
      }
    }
  }

  return operations;
};

export const transformOperation = (operation, concurrentOperations) => {
  // Basic OT transformation
  // This is a simplified version - production OT would be more complex

  let transformedPosition = operation.position;

  for (const concurrentOp of concurrentOperations) {
    if (concurrentOp.timestamp < operation.timestamp) {
      transformedPosition = adjustPositionForConcurrent(
        transformedPosition,
        concurrentOp,
      );
    }
  }

  return {
    ...operation,
    position: transformedPosition,
  };
};

const adjustPositionForConcurrent = (position, concurrentOp) => {
  if (concurrentOp.type === "INSERT") {
    if (concurrentOp.position <= position) {
      return position + concurrentOp.text.length;
    }
  } else if (concurrentOp.type === "DELETE") {
    const deleteEnd = concurrentOp.position + concurrentOp.text.length;
    if (concurrentOp.position < position) {
      if (deleteEnd <= position) {
        return position - concurrentOp.text.length;
      } else {
        return concurrentOp.position;
      }
    }
  }
  return position;
};
