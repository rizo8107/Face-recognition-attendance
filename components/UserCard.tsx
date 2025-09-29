
import React from 'react';
import type { EnrolledUser } from '../types';
import { TrashIcon } from './common/Icons';

interface UserCardProps {
  user: EnrolledUser;
  onDelete: (userId: string) => void;
}

const UserCard: React.FC<UserCardProps> = ({ user, onDelete }) => {
  return (
    <div className="bg-gray-700 rounded-lg overflow-hidden shadow-lg transition-transform transform hover:scale-105 relative">
      <img
        src={`data:image/jpeg;base64,${user.imageBase64}`}
        alt={user.fullName}
        className="w-full h-48 object-cover object-center"
      />
      <div className="p-4">
        <h3 className="text-lg font-bold text-white truncate" title={user.fullName}>{user.fullName}</h3>
        <p className="text-sm text-gray-400 font-mono">{user.userId}</p>
      </div>
       <button
        onClick={() => onDelete(user.userId)}
        className="absolute top-2 right-2 bg-red-600/80 hover:bg-red-600 text-white rounded-full p-2 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-gray-700"
        aria-label={`Delete user ${user.fullName}`}
        title="Delete User"
      >
        <TrashIcon className="w-5 h-5" />
      </button>
    </div>
  );
};

export default UserCard;
